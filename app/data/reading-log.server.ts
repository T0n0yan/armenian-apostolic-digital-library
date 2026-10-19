export type ReadingKind = "read" | "listen" | "quiz";

/** A reader's local date (YYYY-MM-DD) within a day of the server's, or null. */
export function validDay(value: unknown, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && Math.abs(time - now) < 2 * 86_400_000 ? value : null;
}

export async function logReading(database: D1Database, entry: { userId: string; day: string; chatId: string; messageId: number; kind: ReadingKind }) {
  await database.prepare("INSERT OR IGNORE INTO reading_log (user_id, day, chat_id, message_id, kind) VALUES (?, ?, ?, ?, ?)")
    .bind(entry.userId, entry.day, entry.chatId, entry.messageId, entry.kind).run();
}

/** Materials read per day, from the reader's first reading day on (at most about five years). */
export async function readingDays(database: D1Database, userId: string) {
  const { results } = await database.prepare("SELECT day, COUNT(*) AS count FROM reading_log WHERE user_id = ? GROUP BY day ORDER BY day DESC LIMIT 1900")
    .bind(userId).all<{ day: string; count: number }>();
  return Object.fromEntries(results.map((row) => [row.day, row.count])) as Record<string, number>;
}
