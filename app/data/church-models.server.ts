// Սրբավայրերի 3D մոդելները (անձնագրեր)՝ սևագիր, հրապարակված տարբերակ, պատմություն։
import { validateModel, type ChurchModel } from "../church3d/model";

export const MAX_MODEL_BYTES = 200_000;
const KEEP_VERSIONS = 20;

export type ModelVersion = { id: number; savedBy: string; savedAt: string; published: boolean };

function parse(json: string | null | undefined): ChurchModel | null {
  if (!json) return null;
  try {
    return validateModel(JSON.parse(json)).model;
  } catch {
    return null;
  }
}

export async function getModelRecord(db: D1Database, placeId: string) {
  const [row, versions] = await Promise.all([
    db.prepare("SELECT draft_json, published_json, updated_by, updated_at, published_at FROM church_models WHERE place_id = ?").bind(placeId)
      .first<{ draft_json: string; published_json: string | null; updated_by: string; updated_at: string; published_at: string | null }>(),
    db.prepare("SELECT id, saved_by, saved_at, published FROM church_model_versions WHERE place_id = ? ORDER BY id DESC LIMIT ?").bind(placeId, KEEP_VERSIONS)
      .all<{ id: number; saved_by: string; saved_at: string; published: number }>(),
  ]);
  return {
    draft: parse(row?.draft_json),
    published: parse(row?.published_json),
    // Սևագիրը տարբերվում է հրապարակվածից (հրապարակելու բան կա)։
    changed: Boolean(row && row.draft_json !== row.published_json),
    updatedBy: row?.updated_by ?? "",
    updatedAt: row?.updated_at ?? null,
    publishedAt: row?.published_at ?? null,
    versions: versions.results.map((v): ModelVersion => ({ id: v.id, savedBy: v.saved_by, savedAt: v.saved_at, published: Boolean(v.published) })),
  };
}

/** Հրապարակված մոդելը՝ միայն հրապարակված սրբավայրի համար (կայքի էջը)։ */
export async function getPublishedModel(db: D1Database, placeId: string) {
  const row = await db.prepare(
    "SELECT p.name, m.published_json FROM places p JOIN church_models m ON m.place_id = p.id WHERE p.id = ? AND p.published = 1 AND m.published_json IS NOT NULL",
  ).bind(placeId).first<{ name: string; published_json: string }>();
  const model = parse(row?.published_json);
  return row && model ? { name: row.name, model } : null;
}

export async function hasPublishedModel(db: D1Database, placeId: string) {
  return Boolean(await db.prepare("SELECT 1 FROM church_models WHERE place_id = ? AND published_json IS NOT NULL").bind(placeId).first());
}

async function trimVersions(db: D1Database, placeId: string) {
  await db.prepare(
    "DELETE FROM church_model_versions WHERE place_id = ? AND id NOT IN (SELECT id FROM church_model_versions WHERE place_id = ? ORDER BY id DESC LIMIT ?)",
  ).bind(placeId, placeId, KEEP_VERSIONS).run();
}

/** Պահում է սևագիրը (ստուգված JSON) և տարբերակը պատմության մեջ։ */
export async function saveDraft(db: D1Database, placeId: string, json: string, by: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (json.length > MAX_MODEL_BYTES) return { ok: false, errors: ["Մոդելը չափազանց մեծ է (առավելագույնը 200 ԿԲ)"] };
  let input: unknown;
  try { input = JSON.parse(json); } catch { return { ok: false, errors: ["JSON-ը կարդալ չհաջողվեց"] }; }
  const { model, errors } = validateModel(input);
  if (!model) return { ok: false, errors };
  const clean = JSON.stringify(model);
  await db.batch([
    db.prepare(
      "INSERT INTO church_models (place_id, draft_json, updated_by, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) "
      + "ON CONFLICT (place_id) DO UPDATE SET draft_json = excluded.draft_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    ).bind(placeId, clean, by),
    db.prepare("INSERT INTO church_model_versions (place_id, model_json, saved_by) VALUES (?, ?, ?)").bind(placeId, clean, by),
  ]);
  await trimVersions(db, placeId);
  return { ok: true };
}

/** Հրապարակում է սևագիրը (միայն տերը)։ */
export async function publishDraft(db: D1Database, placeId: string, by: string) {
  const row = await db.prepare("SELECT draft_json FROM church_models WHERE place_id = ?").bind(placeId).first<{ draft_json: string }>();
  if (!row || !parse(row.draft_json)) return false;
  await db.batch([
    db.prepare("UPDATE church_models SET published_json = draft_json, published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE place_id = ?").bind(placeId),
    db.prepare("INSERT INTO church_model_versions (place_id, model_json, saved_by, published) VALUES (?, ?, ?, 1)").bind(placeId, row.draft_json, by),
  ]);
  await trimVersions(db, placeId);
  return true;
}

/** Թաքցնում է 3D-ն կայքից (սևագիրը մնում է)։ */
export async function unpublish(db: D1Database, placeId: string) {
  await db.prepare("UPDATE church_models SET published_json = NULL, published_at = NULL WHERE place_id = ?").bind(placeId).run();
}

/** Նախկին տարբերակը դարձնում է սևագիր։ */
export async function restoreVersion(db: D1Database, placeId: string, versionId: number, by: string) {
  const row = await db.prepare("SELECT model_json FROM church_model_versions WHERE id = ? AND place_id = ?").bind(versionId, placeId).first<{ model_json: string }>();
  return row ? saveDraft(db, placeId, row.model_json, by) : { ok: false as const, errors: ["Տարբերակը չգտնվեց"] };
}
