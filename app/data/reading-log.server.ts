import { createMaterialId } from "../../shared/telegram-bridge-contract";

export type ReadingKind = "read" | "listen" | "watch" | "quiz";

/** A reader's local date (YYYY-MM-DD) within a day of the server's, or null. */
export function validDay(value: unknown, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && Math.abs(time - now) < 2 * 86_400_000 ? value : null;
}

/** Any well-formed date, for looking back at past days. */
export function anyDay(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ? value : null;
}

export async function logReading(database: D1Database, entry: { userId: string; day: string; chatId: string; messageId: number; kind: ReadingKind }) {
  // A reader's own mark replaces an earlier one that day (for example "read" becomes "listened").
  await database.prepare("INSERT INTO reading_log (user_id, day, chat_id, message_id, kind) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, day, chat_id, message_id) DO UPDATE SET kind = excluded.kind")
    .bind(entry.userId, entry.day, entry.chatId, entry.messageId, entry.kind).run();
}

export async function removeReading(database: D1Database, entry: { userId: string; day: string; chatId: string; messageId: number }) {
  await database.prepare("DELETE FROM reading_log WHERE user_id = ? AND day = ? AND chat_id = ? AND message_id = ?")
    .bind(entry.userId, entry.day, entry.chatId, entry.messageId).run();
}

/** Materials read per day, from the reader's first reading day on (at most about five years). */
export async function readingDays(database: D1Database, userId: string) {
  const { results } = await database.prepare("SELECT day, COUNT(*) AS count FROM reading_log WHERE user_id = ? GROUP BY day ORDER BY day DESC LIMIT 1900")
    .bind(userId).all<{ day: string; count: number }>();
  return Object.fromEntries(results.map((row) => [row.day, row.count])) as Record<string, number>;
}

/** What the reader read, listened to or watched on one day, with titles and sections. */
export async function readingEntries(database: D1Database, userId: string, day: string) {
  const { results } = await database.prepare(
    `SELECT log.chat_id, log.message_id, log.kind, materials.title, topics.title AS category_name
     FROM reading_log AS log
     LEFT JOIN library_materials AS materials ON materials.chat_id = log.chat_id AND materials.message_id = log.message_id
     LEFT JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE log.user_id = ? AND log.day = ? ORDER BY log.logged_at`,
  ).bind(userId, day).all<{ chat_id: string; message_id: number; kind: ReadingKind; title: string | null; category_name: string | null }>();
  return results.map((row) => ({
    materialId: createMaterialId(row.chat_id, row.message_id),
    kind: row.kind,
    title: row.title?.trim() || "Նյութ",
    categoryName: row.category_name,
  }));
}

/** The recent days (local dates) on which the reader marked this material. */
export async function materialMarks(database: D1Database, userId: string, chatId: string, messageId: number) {
  const { results } = await database.prepare("SELECT day, kind FROM reading_log WHERE user_id = ? AND chat_id = ? AND message_id = ? AND day >= date('now', '-2 day')")
    .bind(userId, chatId, messageId).all<{ day: string; kind: ReadingKind }>();
  return results;
}
