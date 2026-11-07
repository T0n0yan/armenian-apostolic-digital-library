import { parseStoredLayout, type PrayerLayout } from "../utils/prayer-layout";

type Reference = { chatId: string; messageId: number };

/** Նյութի պահված ձևավորումը և այն Telegram-ի տեքստի նշանը, որի վրա այն արվել է։ */
export async function getMaterialLayout(database: D1Database, reference: Reference) {
  const row = await database.prepare("SELECT layout_json, source_hash, updated_at FROM material_layouts WHERE chat_id = ? AND message_id = ?")
    .bind(reference.chatId, reference.messageId).first<{ layout_json: string; source_hash: string; updated_at: string }>();
  const layout = row ? parseStoredLayout(row.layout_json) : null;
  return layout && row ? { layout, sourceHash: row.source_hash, updatedAt: row.updated_at } : null;
}

export async function saveMaterialLayout(database: D1Database, reference: Reference, layout: PrayerLayout, sourceHash: string, userId: string) {
  await database.prepare(
    `INSERT INTO material_layouts (chat_id, message_id, layout_json, source_hash, updated_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, message_id) DO UPDATE SET layout_json = excluded.layout_json, source_hash = excluded.source_hash,
       updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(reference.chatId, reference.messageId, JSON.stringify(layout), sourceHash, userId).run();
}

export async function deleteMaterialLayout(database: D1Database, reference: Reference) {
  await database.prepare("DELETE FROM material_layouts WHERE chat_id = ? AND message_id = ?").bind(reference.chatId, reference.messageId).run();
}
