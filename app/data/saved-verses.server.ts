import { createMaterialId } from "../../shared/telegram-bridge-contract";

export type SavedVerse = { materialId: string; verse: number; text: string; label: string; path: string; savedAt: string };

/** The verses of one psalm this reader saved. */
export async function listSavedVerseNumbers(database: D1Database, userId: string, chatId: string, messageId: number) {
  const { results } = await database.prepare("SELECT verse FROM saved_verses WHERE user_id = ? AND chat_id = ? AND message_id = ?")
    .bind(userId, chatId, messageId).all<{ verse: number }>();
  return results.map((row) => row.verse);
}

/** All verses this reader saved, newest first. */
export async function listSavedVerses(database: D1Database, userId: string): Promise<SavedVerse[]> {
  const { results } = await database.prepare(
    "SELECT chat_id, message_id, verse, verse_text, label, path, saved_at FROM saved_verses WHERE user_id = ? ORDER BY saved_at DESC LIMIT 500",
  ).bind(userId).all<{ chat_id: string; message_id: number; verse: number; verse_text: string; label: string; path: string; saved_at: string }>();
  return results.map((row) => ({ materialId: createMaterialId(row.chat_id, row.message_id), verse: row.verse, text: row.verse_text, label: row.label, path: row.path, savedAt: row.saved_at }));
}

export async function setVerseSaved(database: D1Database, userId: string, chatId: string, messageId: number, verse: { number: number; text: string; label: string; path: string }, saved: boolean) {
  if (!saved) {
    await database.prepare("DELETE FROM saved_verses WHERE user_id = ? AND chat_id = ? AND message_id = ? AND verse = ?").bind(userId, chatId, messageId, verse.number).run();
    return;
  }
  await database.prepare(
    `INSERT INTO saved_verses (user_id, chat_id, message_id, verse, verse_text, label, path) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, chat_id, message_id, verse) DO UPDATE SET verse_text = excluded.verse_text, label = excluded.label, path = excluded.path`,
  ).bind(userId, chatId, messageId, verse.number, verse.text.slice(0, 2000), verse.label.slice(0, 200), verse.path.slice(0, 200)).run();
}
