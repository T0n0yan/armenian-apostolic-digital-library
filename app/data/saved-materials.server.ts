export type SavedMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  categoryName: string;
  categorySlug: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
  savedAt: string;
};

type SavedMaterialRow = {
  id: string;
  title: string;
  telegram_url: string;
  category_name: string;
  category_slug: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  media_types: string;
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
): Promise<SavedMaterial[]> {
  const { results } = await database
    .prepare(
      `SELECT
         materials.id,
         materials.title,
         materials.telegram_url,
         materials.number_value,
         materials.date_value,
         materials.published_at,
         materials.media_types,
         categories.name AS category_name,
         categories.slug AS category_slug,
         saved_materials.saved_at
       FROM saved_materials
       INNER JOIN materials ON materials.id = saved_materials.material_id
       INNER JOIN categories ON categories.id = materials.category_id
       WHERE saved_materials.user_id = ?
         AND materials.visibility = 'visible'
         AND categories.is_active = 1
       ORDER BY saved_materials.saved_at DESC`,
    )
    .bind(userId)
    .all<SavedMaterialRow>();

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    telegramUrl: row.telegram_url,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    numberValue: row.number_value,
    dateValue: row.date_value,
    publishedAt: row.published_at,
    mediaTypes: parseMediaTypes(row.media_types),
    savedAt: row.saved_at,
  }));
}

export async function setMaterialSaved(
  database: D1Database,
  userId: string,
  materialId: string,
  saved: boolean,
) {
  if (saved) {
    const result = await database
      .prepare(
        `INSERT OR IGNORE INTO saved_materials (user_id, material_id)
         SELECT ?, materials.id
         FROM materials
         INNER JOIN categories ON categories.id = materials.category_id
         WHERE materials.id = ?
           AND materials.visibility = 'visible'
           AND categories.is_active = 1`,
      )
      .bind(userId, materialId)
      .run();
    return result.meta.changes > 0;
  }

  await database
    .prepare("DELETE FROM saved_materials WHERE user_id = ? AND material_id = ?")
    .bind(userId, materialId)
    .run();
  return false;
}
