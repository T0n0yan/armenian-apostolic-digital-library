import { guideFromRow, type Guide, type GuideInput, type GuideRow } from "../utils/guides";

const COLUMNS = "slug, title, description, summary, kind, link, icon, body_json, sources_json, status, verified_by, sort, updated_at";

/** Բոլոր ուղեցույցները կարգով. withDrafts՝ նաև սևագրերը (ադմինի համար)։ */
export async function listGuides(db: D1Database, withDrafts = false): Promise<Guide[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM guides ${withDrafts ? "" : "WHERE status != 'draft'"} ORDER BY sort, title`).all<GuideRow>();
  return results.map(guideFromRow);
}

export async function getGuide(db: D1Database, slug: string): Promise<Guide | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM guides WHERE slug = ?`).bind(slug).first<GuideRow>();
  return row ? guideFromRow(row) : null;
}

/** Նորը կամ եղածը (slug-ով)։ originalSlug՝ եթե ադմինը փոխել է հասցեն։ */
export async function saveGuide(db: D1Database, input: GuideInput, userId: string, originalSlug?: string) {
  const values = [input.slug, input.title, input.description, input.summary, input.kind, input.link, input.icon,
    JSON.stringify(input.body), JSON.stringify(input.sources), input.status, input.verifiedBy, input.sort, userId];
  if (originalSlug && originalSlug !== input.slug) {
    if (await getGuide(db, input.slug)) return { ok: false as const, error: "Այդ հասցեով ուղեցույց արդեն կա։" };
    await db.prepare(`UPDATE guides SET slug = ?, title = ?, description = ?, summary = ?, kind = ?, link = ?, icon = ?, body_json = ?, sources_json = ?,
      status = ?, verified_by = ?, sort = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE slug = ?`).bind(...values, originalSlug).run();
    return { ok: true as const };
  }
  await db.prepare(`INSERT INTO guides (slug, title, description, summary, kind, link, icon, body_json, sources_json, status, verified_by, sort, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET title = excluded.title, description = excluded.description, summary = excluded.summary, kind = excluded.kind,
      link = excluded.link, icon = excluded.icon, body_json = excluded.body_json, sources_json = excluded.sources_json, status = excluded.status,
      verified_by = excluded.verified_by, sort = excluded.sort, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(...values).run();
  return { ok: true as const };
}

export function deleteGuide(db: D1Database, slug: string) {
  return db.prepare("DELETE FROM guides WHERE slug = ?").bind(slug).run();
}
