export type CategorySummary = {
  id: string;
  slug: string;
  name: string;
  defaultSort: "title-asc" | "manual" | "number-asc" | "date-desc";
  materialCount: number;
};

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  default_sort: CategorySummary["defaultSort"];
  material_count: number;
};

export async function listActiveCategories(
  database: D1Database,
): Promise<CategorySummary[]> {
  const { results } = await database
    .prepare(
      `SELECT
         categories.id,
         categories.slug,
         categories.name,
         categories.default_sort,
         COUNT(materials.id) AS material_count
       FROM categories
       LEFT JOIN materials
         ON materials.category_id = categories.id
        AND materials.visibility = 'visible'
       WHERE categories.is_active = 1
       GROUP BY
         categories.id,
         categories.slug,
         categories.name,
         categories.default_sort,
         categories.sort_order
       ORDER BY categories.sort_order ASC`,
    )
    .all<CategoryRow>();

  return results.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    defaultSort: category.default_sort,
    materialCount: Number(category.material_count),
  }));
}
