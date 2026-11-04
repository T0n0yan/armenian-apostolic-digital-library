import { createMaterialId } from "../../shared/telegram-bridge-contract";
import { HIGHLIGHTS_PER_USER, NOTE_MAX, type Highlight, type HighlightKind } from "../utils/highlights";

type Row = {
  id: string; chat_id: string; message_id: number; kind: HighlightKind; quote: string; prefix: string; suffix: string;
  emoji: string; note: string; answer: string; answered_at: string | null; section: string; title: string; path: string; created_at: string;
};

const COLUMNS = "id, chat_id, message_id, kind, quote, prefix, suffix, emoji, note, answer, answered_at, section, title, path, created_at";

function toHighlight(row: Row): Highlight {
  return {
    id: row.id, materialId: createMaterialId(row.chat_id, row.message_id), kind: row.kind, quote: row.quote,
    prefix: row.prefix, suffix: row.suffix, emoji: row.emoji, note: row.note, answer: row.answer, answeredAt: row.answered_at,
    section: row.section, title: row.title, path: row.path, createdAt: row.created_at,
  };
}

/** Մեկ նյութի նշումները (նյութի էջում ներկելու համար)։ */
export async function listMaterialHighlights(db: D1Database, userId: string, chatId: string, messageId: number) {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM highlights WHERE user_id = ? AND chat_id = ? AND message_id = ? ORDER BY created_at`)
    .bind(userId, chatId, messageId).all<Row>();
  return results.map(toHighlight);
}

/** Բոլոր նշումները՝ նորից հին («Նշումներ» էջի համար)։ */
export async function listHighlights(db: D1Database, userId: string) {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM highlights WHERE user_id = ? ORDER BY created_at DESC LIMIT ${HIGHLIGHTS_PER_USER}`)
    .bind(userId).all<Row>();
  return results.map(toHighlight);
}

/** Քանի չպատասխանված հարց ունի մարդը (եկեղեցու մոտ հուշելու համար)։ */
export async function openQuestionCount(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM highlights WHERE user_id = ? AND kind = 'question' AND answered_at IS NULL")
    .bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getHighlight(db: D1Database, userId: string, id: string) {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM highlights WHERE user_id = ? AND id = ?`).bind(userId, id).first<Row>();
  return row ? toHighlight(row) : null;
}

export type NewHighlight = {
  chatId: string; messageId: number; kind: HighlightKind; quote: string; prefix: string; suffix: string;
  emoji: string; note: string; section: string; title: string; path: string;
};

/** Նոր նշում. null, եթե մարդն արդեն ունի առավելագույն թվով նշում։ Նույն տեղի կրկնակի նշումը չի կրկնվում։ */
export async function createHighlight(db: D1Database, userId: string, item: NewHighlight, id = crypto.randomUUID()) {
  const same = await db.prepare(`SELECT ${COLUMNS} FROM highlights WHERE user_id = ? AND chat_id = ? AND message_id = ? AND quote = ? AND prefix = ? LIMIT 1`)
    .bind(userId, item.chatId, item.messageId, item.quote, item.prefix).first<Row>();
  if (same) return toHighlight(same);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM highlights WHERE user_id = ?").bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= HIGHLIGHTS_PER_USER) return null;
  await db.prepare(
    `INSERT INTO highlights (id, user_id, chat_id, message_id, kind, quote, prefix, suffix, emoji, note, section, title, path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, item.chatId, item.messageId, item.kind, item.quote, item.prefix, item.suffix, item.emoji,
    item.note.slice(0, NOTE_MAX), item.section.slice(0, 120), item.title.slice(0, 300), item.path.slice(0, 300)).run();
  return getHighlight(db, userId, id);
}

export type HighlightChange = { kind?: HighlightKind; emoji?: string; note?: string; answer?: string; answered?: boolean };

/** Փոխում է միայն տրված դաշտերը։ Պատասխանված հարցը դառնում է չպատասխանված, եթե answered=false։ */
export async function updateHighlight(db: D1Database, userId: string, id: string, change: HighlightChange) {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (change.kind) { sets.push("kind = ?"); values.push(change.kind); }
  if (change.emoji !== undefined) { sets.push("emoji = ?"); values.push(change.emoji); }
  if (change.note !== undefined) { sets.push("note = ?"); values.push(change.note.slice(0, NOTE_MAX)); }
  if (change.answer !== undefined) { sets.push("answer = ?"); values.push(change.answer.slice(0, NOTE_MAX)); }
  if (change.answered !== undefined) sets.push(change.answered ? "answered_at = COALESCE(answered_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))" : "answered_at = NULL");
  // Պարզ նշումը պատասխան չունի։
  if (change.kind === "mark") sets.push("answered_at = NULL");
  if (!sets.length) return getHighlight(db, userId, id);
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  await db.prepare(`UPDATE highlights SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`).bind(...values, userId, id).run();
  return getHighlight(db, userId, id);
}

export async function deleteHighlight(db: D1Database, userId: string, id: string) {
  await db.prepare("DELETE FROM highlights WHERE user_id = ? AND id = ?").bind(userId, id).run();
}
