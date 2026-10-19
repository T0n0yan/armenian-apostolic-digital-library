import { createMaterialId } from "../../shared/telegram-bridge-contract";
import { sendWebPush, type PushKeys, type PushSubscriptionRow } from "./web-push.server";

export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type Reminder = { materialId: string; remindAt: string; repeat: ReminderRepeat };
export type UpcomingReminder = Reminder & { at: string; title: string; categoryName: string | null };

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_AHEAD_MS = 366 * DAY;
const BATCH = 40;
const REPEATS: ReminderRepeat[] = ["none", "daily", "weekly", "monthly", "yearly"];

export function isReminderRepeat(value: unknown): value is ReminderRepeat {
  return REPEATS.includes(value as ReminderRepeat);
}

/** A reminder time is valid from a minute ahead (with a little slack) to a year ahead. */
export function validReminderTime(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < now + MINUTE / 2 || time > now + MAX_AHEAD_MS) return null;
  return new Date(time).toISOString();
}

/** The repeat's next time after `now` (calendar months and years keep the same day and hour). */
export function nextOccurrence(remindAt: string, repeat: Exclude<ReminderRepeat, "none">, now = Date.now()) {
  const date = new Date(remindAt);
  let steps = 0;
  while (date.getTime() <= now && steps < 2_000) {
    steps += 1;
    if (repeat === "daily") date.setTime(date.getTime() + DAY);
    else if (repeat === "weekly") date.setTime(date.getTime() + 7 * DAY);
    else if (repeat === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCFullYear(date.getUTCFullYear() + 1);
  }
  return date.toISOString();
}

/** Telegram accounts have numeric ids; Google accounts ("google:…") can't get bot messages. */
export function canMessage(telegramId: string) {
  return /^\d+$/u.test(telegramId);
}

export async function getReminder(database: D1Database, userId: string, chatId: string, messageId: number): Promise<Reminder | null> {
  const row = await database.prepare(
    "SELECT remind_at, repeat FROM reading_reminders WHERE user_id = ? AND chat_id = ? AND message_id = ?",
  ).bind(userId, chatId, messageId).first<{ remind_at: string; repeat: ReminderRepeat }>();
  return row ? { materialId: createMaterialId(chatId, messageId), remindAt: row.remind_at, repeat: row.repeat } : null;
}

export async function setReminder(database: D1Database, reminder: {
  userId: string; telegramId: string; chatId: string; messageId: number; remindAt: string; repeat: ReminderRepeat;
}) {
  await database.prepare(
    `INSERT INTO reading_reminders (user_id, telegram_id, chat_id, message_id, remind_at, repeat)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, chat_id, message_id) DO UPDATE SET
       telegram_id = excluded.telegram_id, remind_at = excluded.remind_at, repeat = excluded.repeat,
       snoozed_until = NULL, last_sent_at = NULL`,
  ).bind(reminder.userId, reminder.telegramId, reminder.chatId, reminder.messageId, reminder.remindAt, reminder.repeat).run();
}

export async function deleteReminder(database: D1Database, userId: string, chatId: string, messageId: number) {
  await database.prepare("DELETE FROM reading_reminders WHERE user_id = ? AND chat_id = ? AND message_id = ?")
    .bind(userId, chatId, messageId).run();
}

/** The reader's reminders that ring within the next `hours` (for the in-app alarm). */
export async function listUpcomingReminders(database: D1Database, userId: string, hours = 24, now = Date.now()): Promise<UpcomingReminder[]> {
  const until = new Date(now + hours * 3_600_000).toISOString();
  const { results } = await database.prepare(
    `SELECT reminders.chat_id, reminders.message_id, reminders.remind_at, reminders.repeat, reminders.snoozed_until,
       materials.title, topics.title AS category_name
     FROM reading_reminders AS reminders
     LEFT JOIN library_materials AS materials
       ON materials.chat_id = reminders.chat_id AND materials.message_id = reminders.message_id
     LEFT JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE reminders.user_id = ? AND (reminders.remind_at <= ? OR reminders.snoozed_until <= ?)
     ORDER BY reminders.remind_at LIMIT 50`,
  ).bind(userId, until, until).all<{ chat_id: string; message_id: number; remind_at: string; repeat: ReminderRepeat; snoozed_until: string | null; title: string | null; category_name: string | null }>();
  return results.map((row) => ({
    materialId: createMaterialId(row.chat_id, row.message_id),
    remindAt: row.remind_at,
    repeat: row.repeat,
    at: row.snoozed_until && row.snoozed_until < row.remind_at ? row.snoozed_until : row.remind_at,
    title: row.title?.trim() || "Հոգևոր ժառանգություն",
    categoryName: row.category_name,
  }));
}

type ReminderKey = { userId: string; chatId: string; messageId: number };

export type MissedReminder = { materialId: string; rangAt: string; title: string; categoryName: string | null };

/** Reminders that rang and wait for the reader's "Կարդացել եմ". */
export async function listMissedReminders(database: D1Database, userId: string): Promise<MissedReminder[]> {
  const { results } = await database.prepare(
    `SELECT inbox.chat_id, inbox.message_id, inbox.rang_at, materials.title, topics.title AS category_name
     FROM reminder_inbox AS inbox
     LEFT JOIN library_materials AS materials ON materials.chat_id = inbox.chat_id AND materials.message_id = inbox.message_id
     LEFT JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE inbox.user_id = ? ORDER BY inbox.rang_at DESC LIMIT 30`,
  ).bind(userId).all<{ chat_id: string; message_id: number; rang_at: string; title: string | null; category_name: string | null }>();
  return results.map((row) => ({ materialId: createMaterialId(row.chat_id, row.message_id), rangAt: row.rang_at, title: row.title?.trim() || "Հոգևոր ժառանգություն", categoryName: row.category_name }));
}

export async function markReminderRead(database: D1Database, key: ReminderKey) {
  await database.prepare("DELETE FROM reminder_inbox WHERE user_id = ? AND chat_id = ? AND message_id = ?").bind(key.userId, key.chatId, key.messageId).run();
}

/**
 * Marks a reminder as rung (by the in-app alarm or the bot): a snooze is cleared, a one-off
 * reminder is removed and a repeating one moves to its next time.
 */
export async function completeReminder(database: D1Database, key: ReminderKey, now = Date.now()) {
  const row = await database.prepare(
    "SELECT remind_at, repeat, snoozed_until FROM reading_reminders WHERE user_id = ? AND chat_id = ? AND message_id = ?",
  ).bind(key.userId, key.chatId, key.messageId).first<{ remind_at: string; repeat: ReminderRepeat; snoozed_until: string | null }>();
  if (!row) return;
  const nowIso = new Date(now).toISOString();
  // It stays in the bell's list until the reader marks it read.
  await database.prepare("INSERT OR REPLACE INTO reminder_inbox (user_id, chat_id, message_id, rang_at) VALUES (?, ?, ?, ?)")
    .bind(key.userId, key.chatId, key.messageId, nowIso).run();
  const regularDue = row.remind_at <= nowIso;
  if (!regularDue) {
    // Only the snooze rang; the regular time stays.
    await database.prepare("UPDATE reading_reminders SET snoozed_until = NULL, last_sent_at = ? WHERE user_id = ? AND chat_id = ? AND message_id = ?")
      .bind(nowIso, key.userId, key.chatId, key.messageId).run();
  } else if (row.repeat === "none") {
    await deleteReminder(database, key.userId, key.chatId, key.messageId);
  } else {
    await database.prepare("UPDATE reading_reminders SET remind_at = ?, snoozed_until = NULL, last_sent_at = ? WHERE user_id = ? AND chat_id = ? AND message_id = ?")
      .bind(nextOccurrence(row.remind_at, row.repeat, now), nowIso, key.userId, key.chatId, key.messageId).run();
  }
}

/** Rings again in a few minutes; a one-off that already rang is kept as a one-off for then. */
export async function snoozeReminder(database: D1Database, key: ReminderKey & { telegramId: string }, minutes: number, now = Date.now()) {
  const at = new Date(now + minutes * MINUTE).toISOString();
  await database.prepare(
    `INSERT INTO reading_reminders (user_id, telegram_id, chat_id, message_id, remind_at, repeat)
     VALUES (?, ?, ?, ?, ?, 'none')
     ON CONFLICT(user_id, chat_id, message_id) DO UPDATE SET snoozed_until = ?`,
  ).bind(key.userId, key.telegramId, key.chatId, key.messageId, at, at).run();
}

type TelegramResult = { ok: boolean; error_code?: number; description?: string };

async function callBot(token: string, method: string, body: unknown): Promise<TelegramResult> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await response?.json().catch(() => null) as TelegramResult | null) ?? { ok: false };
}

/**
 * Sends the church bell once per Telegram reader, with how to make it the sound of the bot's
 * messages (Telegram plays the sound a reader picks for a chat; a bot cannot choose it).
 */
export async function sendBellSoundOnce(database: D1Database, token: string, telegramId: string, publicUrl: string) {
  if (!canMessage(telegramId)) return;
  const inserted = await database.prepare("INSERT OR IGNORE INTO reminder_sound_sent (telegram_id) VALUES (?)").bind(telegramId).run();
  if (!inserted.meta.changes) return;
  const result = await callBot(token, "sendAudio", {
    chat_id: Number(telegramId),
    audio: `${publicUrl}/sounds/church-bell.mp3`,
    title: "Եկեղեցու զանգ",
    performer: "Հոգևոր ժառանգություն",
    caption: "🔔 Որ հիշեցումները գան եկեղեցու զանգով՝\n1. Սեղմիր այս ձայնի ⋮ → «Save for notifications»։\n2. Այս չատում՝ վերևի անունը → Notifications → Sound → «Եկեղեցու զանգ»։",
  });
  if (!result.ok) await database.prepare("DELETE FROM reminder_sound_sent WHERE telegram_id = ?").bind(telegramId).run();
}

type DueRow = { user_id: string; telegram_id: string; chat_id: string; message_id: number; title: string | null; category_name: string | null };

/** Sends a reminder to every browser the reader allowed notifications in; true if any got it. */
async function pushToBrowsers(database: D1Database, keys: PushKeys, row: DueRow, publicUrl: string) {
  const { results } = await database.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .bind(row.user_id).all<PushSubscriptionRow>();
  const materialId = createMaterialId(row.chat_id, row.message_id);
  let delivered = false;
  for (const subscription of results) {
    const outcome = await sendWebPush(subscription, {
      title: "🔔 Ժամանակն է կարդալու",
      body: row.title?.trim() || "Հոգևոր ժառանգություն",
      url: `${publicUrl}/materials/${materialId}?reminder=1`,
      tag: `reminder-${materialId}`,
      category: row.category_name,
    }, keys);
    if (outcome === "sent") delivered = true;
    console.log(JSON.stringify({ event: "reminder_push", outcome, service: new URL(subscription.endpoint).hostname }));
    if (outcome === "gone") await database.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
  }
  return { delivered, browsers: results.length };
}

/**
 * Sends every reminder (or snooze) that is due, by the bot (Telegram readers) and to the browsers
 * where the reader allowed notifications, then marks it rung.
 */
export async function sendDueReminders(database: D1Database, options: { token: string | null; publicUrl: string; pushKeys: PushKeys | null }, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const { results } = await database.prepare(
    `SELECT reminders.user_id, reminders.telegram_id, reminders.chat_id, reminders.message_id, materials.title,
       topics.title AS category_name
     FROM reading_reminders AS reminders
     LEFT JOIN library_materials AS materials
       ON materials.chat_id = reminders.chat_id AND materials.message_id = reminders.message_id
     LEFT JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE reminders.remind_at <= ? OR reminders.snoozed_until <= ?
     ORDER BY reminders.remind_at LIMIT ${BATCH}`,
  ).bind(nowIso, nowIso).all<DueRow>();

  for (const row of results) {
    const key = { userId: row.user_id, chatId: row.chat_id, messageId: row.message_id };
    let delivered = false;
    let retry = false;
    if (options.pushKeys) {
      const push = await pushToBrowsers(database, options.pushKeys, row, options.publicUrl);
      delivered ||= push.delivered;
    }
    // Google accounts have no Telegram chat: their reminders ring in the app or the browser only.
    if (options.token && canMessage(row.telegram_id)) {
      const materialId = createMaterialId(row.chat_id, row.message_id);
      const title = row.title?.trim() || "Հոգևոր ժառանգություն";
      const result = await callBot(options.token, "sendMessage", {
        chat_id: Number(row.telegram_id),
        text: `🔔 Ժամանակն է կարդալու\n\n${title}`,
        reply_markup: { inline_keyboard: [[{ text: "📖 Կարդալ", web_app: { url: `${options.publicUrl}/materials/${materialId}` } }]] },
      });
      // A blocked bot or a missing chat can never deliver; anything else is retried next minute.
      if (result.ok) delivered = true;
      else if (!(result.error_code === 403 || result.error_code === 400) && !delivered) retry = true;
    }
    if (retry) continue;
    await completeReminder(database, key, now);
  }
}
