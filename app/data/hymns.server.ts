import type { GuideStatus } from "../utils/guides";
import { isHour, type Hymn } from "../utils/hymns";

type Row = Omit<Hymn, "hour" | "status"> & { hour: string; status: string };
const COLUMNS = "id, title, feast, hour, mode, performer, grabar, ashkharhabar, note, status, sort";
const toHymn = (row: Row): Hymn => ({ ...row, hour: isHour(row.hour) ? row.hour : "", status: (["draft", "review", "published"].includes(row.status) ? row.status : "draft") as GuideStatus });

export async function listHymns(db: D1Database, withDrafts = false) {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM hymns ${withDrafts ? "" : "WHERE status != 'draft'"} ORDER BY sort, id`).all<Row>();
  return results.map(toHymn);
}

export async function getHymn(db: D1Database, id: number) {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM hymns WHERE id = ?`).bind(id).first<Row>();
  return row ? toHymn(row) : null;
}

/** Ժամերի համար՝ քանի շարական կա (Ժամերգություններ ուղեցույցում)։ */
export async function hymnCountsByHour(db: D1Database) {
  const { results } = await db.prepare("SELECT hour, COUNT(*) AS count FROM hymns WHERE status != 'draft' AND hour != '' GROUP BY hour").all<{ hour: string; count: number }>();
  return Object.fromEntries(results.map((row) => [row.hour, row.count])) as Record<string, number>;
}

export async function saveHymn(db: D1Database, hymn: Omit<Hymn, "id"> & { id?: number }, userId: string) {
  const values = [hymn.title, hymn.feast, hymn.hour, hymn.mode, hymn.performer, hymn.grabar, hymn.ashkharhabar, hymn.note, hymn.status, hymn.sort, userId];
  if (hymn.id) {
    await db.prepare(`UPDATE hymns SET title = ?, feast = ?, hour = ?, mode = ?, performer = ?, grabar = ?, ashkharhabar = ?, note = ?, status = ?, sort = ?, updated_by = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(...values, hymn.id).run();
    return hymn.id;
  }
  const row = await db.prepare(`INSERT INTO hymns (title, feast, hour, mode, performer, grabar, ashkharhabar, note, status, sort, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(...values).first<{ id: number }>();
  return row?.id ?? 0;
}

export function deleteHymn(db: D1Database, id: number) {
  return db.prepare("DELETE FROM hymns WHERE id = ?").bind(id).run();
}
