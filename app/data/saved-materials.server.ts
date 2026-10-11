import { normalizeSearchText } from "./material-content.server";

export type SavedMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
  personalNote: string;
  savedAt: string;
};

export type SavedMaterialGroup = {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  materials: SavedMaterial[];
};

type SavedMaterialRow = {
  id: string;
  title: string;
  telegram_url: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  media_types: string;
  personal_note: string;
  saved_at: string;
};

function parseMediaTypes(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function listSavedMaterialIds(database: D1Database, userId: string) {
  const { results } = await database
    .prepare("SELECT material_id FROM saved_materials WHERE user_id = ?")
    .bind(userId)
    .all<{ material_id: string }>();
  return results.map((row) => row.material_id);
}

export async function listSavedMaterials(
  database: D1Database,
  userId: string,
  query = "",
): Promise<SavedMaterial[]> {
  const normalizedQuery = normalizeSearchText(query).slice(0, 120);
  const terms = normalizedQuery.split(" ").filter(Boolean).slice(0, 8);
  const searchClauses: string[] = [];
  const searchValues: string[] = [];

  for (const term of terms) {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    searchClauses.push(
      `(materials.search_title LIKE ? ESCAPE '\\'
        OR materials.search_body LIKE ? ESCAPE '\\'
        OR saved_materials.personal_note_search LIKE ? ESCAPE '\\')`,
    );
    searchValues.push(pattern, pattern, pattern);
  }

  const { results } = await database
    .prepare(
      `SELECT
         materials.id,
         materials.title,
         materials.telegram_url,
         categories.id AS category_id,
         materials.number_value,
         materials.date_value,
         materials.published_at,
         materials.media_types,
         categories.name AS category_name,
         categories.slug AS category_slug,
         saved_materials.personal_note,
         saved_materials.saved_at
       FROM saved_materials
       INNER JOIN materials ON materials.id = saved_materials.material_id
       INNER JOIN categories ON categories.id = materials.category_id
       WHERE saved_materials.user_id = ?
         AND materials.visibility = 'visible'
         AND categories.is_active = 1
         ${searchClauses.length > 0 ? `AND ${searchClauses.join(" AND ")}` : ""}
       ORDER BY categories.sort_order ASC, saved_materials.saved_at DESC`,
    )
    .bind(userId, ...searchValues)
    .all<SavedMaterialRow>();

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    telegramUrl: row.telegram_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    numberValue: row.number_value,
    dateValue: row.date_value,
    publishedAt: row.published_at,
    mediaTypes: parseMediaTypes(row.media_types),
    personalNote: row.personal_note,
    savedAt: row.saved_at,
  }));
}

export function groupSavedMaterials(
  materials: SavedMaterial[],
): SavedMaterialGroup[] {
  const groups = new Map<string, SavedMaterialGroup>();
  for (const material of materials) {
    const existing = groups.get(material.categorySlug);
    if (existing) {
      existing.materials.push(material);
      continue;
    }
    groups.set(material.categorySlug, {
      categoryId: material.categoryId,
      categoryName: material.categoryName,
      categorySlug: material.categorySlug,
      materials: [material],
    });
  }
  return Array.from(groups.values());
}

export async function setMaterialSaved(
  database: D1Database,
  userId: string,
  materialId: string,
  saved: boolean,
  personalNote = "",
) {
  if (saved) {
    const note = Array.from(personalNote.trim()).slice(0, 160).join("");
    const noteSearch = normalizeSearchText(note).slice(0, 200);
    const result = await database
      .prepare(
        `INSERT INTO saved_materials (
           user_id,
           material_id,
           personal_note,
           personal_note_search
         )
         SELECT ?, materials.id, ?, ?
         FROM materials
         INNER JOIN categories ON categories.id = materials.category_id
         WHERE materials.id = ?
           AND materials.visibility = 'visible'
           AND categories.is_active = 1
         ON CONFLICT(user_id, material_id) DO UPDATE SET
           personal_note = excluded.personal_note,
           personal_note_search = excluded.personal_note_search`,
      )
      .bind(userId, note, noteSearch, materialId)
      .run();
    return result.meta.changes > 0;
  }

  await database
    .prepare("DELETE FROM saved_materials WHERE user_id = ? AND material_id = ?")
    .bind(userId, materialId)
    .run();
  return false;
}
