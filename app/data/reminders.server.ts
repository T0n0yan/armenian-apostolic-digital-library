import { createMaterialId } from "../../shared/telegram-bridge-contract";

export type ReminderRepeat = "none" | "daily" | "weekly";
export type Reminder = { materialId: string; remindAt: string; repeat: ReminderRepeat };

const MINUTE = 60_000;
const DAY = 86_400_000;
const REPEAT_MS: Record<Exclude<ReminderRepeat, "none">, number> = { daily: DAY, weekly: 7 * DAY };
const MAX_AHEAD_MS = 366 * DAY;
const BATCH = 40;

export function isReminderRepeat(value: unknown): value is ReminderRepeat {
  return value === "none" || value === "daily" || value === "weekly";
}

/** A reminder time is valid from a minute ahead (with a little slack) to a year ahead. */
export function validReminderTime(value: unknown, now = Date.now()) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < now + MINUTE / 2 || time > now + MAX_AHEAD_MS) return null;
  return new Date(time).toISOString();
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
       telegram_id = excluded.telegram_id, remind_at = excluded.remind_at, repeat = excluded.repeat, last_sent_at = NULL`,
  ).bind(reminder.userId, reminder.telegramId, reminder.chatId, reminder.messageId, reminder.remindAt, reminder.repeat).run();
}

export async function deleteReminder(database: D1Database, userId: string, chatId: string, messageId: number) {
  await database.prepare("DELETE FROM reading_reminders WHERE user_id = ? AND chat_id = ? AND message_id = ?")
    .bind(userId, chatId, messageId).run();
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
 * Sends the church bell once per reader, with how to make it the sound of the bot's messages
 * (Telegram plays the sound a reader picks for a chat; a bot cannot choose it).
 */
export async function sendBellSoundOnce(database: D1Database, token: string, telegramId: string, publicUrl: string) {
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

type DueRow = { user_id: string; telegram_id: string; chat_id: string; message_id: number; remind_at: string; repeat: ReminderRepeat; title: string | null };

/** Sends every reminder that is due, then moves repeating ones to their next time. */
export async function sendDueReminders(database: D1Database, token: string, publicUrl: string, now = Date.now()) {
  const { results } = await database.prepare(
    `SELECT reminders.user_id, reminders.telegram_id, reminders.chat_id, reminders.message_id,
       reminders.remind_at, reminders.repeat, materials.title
     FROM reading_reminders AS reminders
     LEFT JOIN library_materials AS materials
       ON materials.chat_id = reminders.chat_id AND materials.message_id = reminders.message_id
     WHERE reminders.remind_at <= ? ORDER BY reminders.remind_at LIMIT ${BATCH}`,
  ).bind(new Date(now).toISOString()).all<DueRow>();

  for (const row of results) {
    const materialId = createMaterialId(row.chat_id, row.message_id);
    const title = row.title?.trim() || "Հոգևոր ժառանգություն";
    const result = await callBot(token, "sendMessage", {
      chat_id: Number(row.telegram_id),
      text: `🔔 Ժամանակն է կարդալու\n\n${title}`,
      reply_markup: { inline_keyboard: [[{ text: "📖 Կարդալ", web_app: { url: `${publicUrl}/materials/${materialId}` } }]] },
    });
    const key = [row.user_id, row.chat_id, row.message_id] as const;
    // The reader blocked the bot or the chat is gone: the reminder can never arrive.
    const undeliverable = !result.ok && (result.error_code === 403 || result.error_code === 400);
    if (!result.ok && !undeliverable) continue;
    if (row.repeat === "none" || undeliverable) {
      await database.prepare("DELETE FROM reading_reminders WHERE user_id = ? AND chat_id = ? AND message_id = ?").bind(...key).run();
    } else {
      let next = Date.parse(row.remind_at);
      while (next <= now) next += REPEAT_MS[row.repeat];
      await database.prepare("UPDATE reading_reminders SET remind_at = ?, last_sent_at = ? WHERE user_id = ? AND chat_id = ? AND message_id = ?")
        .bind(new Date(next).toISOString(), new Date(now).toISOString(), ...key).run();
    }
  }
}
