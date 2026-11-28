import { churchAudioUrl, isSpeaker, type ChurchAudio, type LiturgyLine } from "../utils/liturgy-text";

type Row = Omit<LiturgyLine, "speaker"> & { speaker: string };

export async function listLiturgyLines(db: D1Database): Promise<LiturgyLine[]> {
  const { results } = await db.prepare("SELECT id, sort, part, speaker, grabar, ashkharhabar, rubric, note, start FROM liturgy_lines ORDER BY sort, id").all<Row>();
  return results.map((row) => ({ ...row, speaker: isSpeaker(row.speaker) ? row.speaker : "priest" }));
}

export async function saveLiturgyLine(db: D1Database, line: Omit<LiturgyLine, "id" | "start"> & { id?: number }, userId: string) {
  if (line.id) {
    await db.prepare(`UPDATE liturgy_lines SET sort = ?, part = ?, speaker = ?, grabar = ?, ashkharhabar = ?, rubric = ?, note = ?, updated_by = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(line.sort, line.part, line.speaker, line.grabar, line.ashkharhabar, line.rubric, line.note, userId, line.id).run();
  } else {
    await db.prepare("INSERT INTO liturgy_lines (sort, part, speaker, grabar, ashkharhabar, rubric, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(line.sort, line.part, line.speaker, line.grabar, line.ashkharhabar, line.rubric, line.note, userId).run();
  }
}

export function deleteLiturgyLine(db: D1Database, id: number) {
  return db.prepare("DELETE FROM liturgy_lines WHERE id = ?").bind(id).run();
}

/** Ժամանակները՝ { id: վայրկյան | null }։ */
export async function saveLiturgyTimings(db: D1Database, starts: Record<string, number | null>) {
  const statements = Object.entries(starts).map(([id, start]) => db.prepare("UPDATE liturgy_lines SET start = ? WHERE id = ?").bind(start, Number(id)));
  if (statements.length) await db.batch(statements);
}

export async function getChurchAudio(db: D1Database, id: string): Promise<ChurchAudio | null> {
  const row = await db.prepare("SELECT id, object_key, size FROM church_audio WHERE id = ?").bind(id).first<{ id: string; object_key: string; size: number }>();
  return row ? { id: row.id, url: churchAudioUrl(row.object_key), size: row.size } : null;
}

export async function listChurchAudio(db: D1Database, prefix: string) {
  const { results } = await db.prepare("SELECT id, object_key, size FROM church_audio WHERE id LIKE ?").bind(`${prefix}%`).all<{ id: string; object_key: string; size: number }>();
  return new Map(results.map((row) => [row.id, { id: row.id, url: churchAudioUrl(row.object_key), size: row.size }]));
}

/** Նոր ֆայլը փոխարինում է նախորդին (հինը ջնջվում է R2-ից)։ */
export async function setChurchAudio(db: D1Database, media: R2Bucket, id: string, file: { key: string; type: string; size: number }, userId: string) {
  const old = await db.prepare("SELECT object_key FROM church_audio WHERE id = ?").bind(id).first<{ object_key: string }>();
  await db.prepare(`INSERT INTO church_audio (id, object_key, content_type, size, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET object_key = excluded.object_key, content_type = excluded.content_type, size = excluded.size,
      duration = NULL, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(id, file.key, file.type, file.size, userId).run();
  if (old && old.object_key !== file.key) await media.delete(old.object_key);
}

export async function removeChurchAudio(db: D1Database, media: R2Bucket, id: string) {
  const old = await db.prepare("SELECT object_key FROM church_audio WHERE id = ?").bind(id).first<{ object_key: string }>();
  if (!old) return;
  await db.prepare("DELETE FROM church_audio WHERE id = ?").bind(id).run();
  await media.delete(old.object_key);
}
