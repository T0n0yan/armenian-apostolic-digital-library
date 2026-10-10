export type AdminMaterial = {
  id: string;
  title: string;
  categoryName: string;
  telegramUrl: string;
  visibility: "visible" | "hidden";
  createdAt: string;
};

type AdminMaterialRow = {
  id: string;
  title: string;
  category_name: string;
  telegram_url: string;
  visibility: AdminMaterial["visibility"];
  created_at: string;
};

export type CreateMaterialInput = {
  title: string;
  categoryId: string;
  telegramUrl: string;
};

export class MaterialWriteError extends Error {
  constructor(
    public readonly code: "category-not-found" | "duplicate-telegram-url",
  ) {
    super(code);
    this.name = "MaterialWriteError";
  }
}

export async function listAdminMaterials(
  database: D1Database,
): Promise<AdminMaterial[]> {
  const { results } = await database
    .prepare(
      `SELECT
         materials.id,
         materials.title,
         categories.name AS category_name,
         materials.telegram_url,
         materials.visibility,
         materials.created_at
       FROM materials
       INNER JOIN categories ON categories.id = materials.category_id
       ORDER BY materials.created_at DESC, materials.id DESC
       LIMIT 100`,
    )
    .all<AdminMaterialRow>();

  return results.map((material) => ({
    id: material.id,
    title: material.title,
    categoryName: material.category_name,
    telegramUrl: material.telegram_url,
    visibility: material.visibility,
    createdAt: material.created_at,
  }));
}

export async function createMaterial(
  database: D1Database,
  input: CreateMaterialInput,
) {
  const category = await database
    .prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1")
    .bind(input.categoryId)
    .first<{ id: string }>();

  if (!category) {
    throw new MaterialWriteError("category-not-found");
  }

  const id = `material_${crypto.randomUUID()}`;
  const searchTitle = input.title.toLocaleLowerCase("hy-AM");

  try {
    await database
      .prepare(
        `INSERT INTO materials (
           id,
           title,
           search_title,
           category_id,
           telegram_url,
           telegram_url_key
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.title,
        searchTitle,
        input.categoryId,
        input.telegramUrl,
        input.telegramUrl,
      )
      .run();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("materials.telegram_url_key")
    ) {
      throw new MaterialWriteError("duplicate-telegram-url");
    }

    throw error;
  }

  return { id };
}
