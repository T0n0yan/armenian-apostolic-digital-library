export type AdminMaterial = {
  id: string;
  title: string;
  categoryName: string;
  telegramUrl: string;
  visibility: "visible" | "hidden";
  createdAt: string;
};

export type PublicMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
};

type PublicMaterialRow = {
  id: string;
  title: string;
  telegram_url: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  media_types: string;
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
  numberValue?: number | null;
  dateValue?: string | null;
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
       ORDER BY
         COALESCE(materials.published_at, materials.created_at) DESC,
         materials.id DESC
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

export async function countAdminMaterials(database: D1Database) {
  const row = await database
    .prepare("SELECT COUNT(*) AS material_count FROM materials")
    .first<{ material_count: number }>();
  return Number(row?.material_count ?? 0);
}

export async function listPublicMaterialsByCategory(
  database: D1Database,
  categoryId: string,
  defaultSort: "title-asc" | "manual" | "number-asc" | "date-desc",
): Promise<PublicMaterial[]> {
  const orderBy = {
    "title-asc": "materials.title COLLATE NOCASE ASC, materials.id ASC",
    manual:
      "materials.sort_order ASC, COALESCE(materials.published_at, materials.created_at) DESC",
    "number-asc":
      "materials.number_value IS NULL ASC, materials.number_value ASC, materials.title COLLATE NOCASE ASC",
    "date-desc":
      "materials.date_value DESC, COALESCE(materials.published_at, materials.created_at) DESC",
  }[defaultSort];

  const { results } = await database
    .prepare(
      `SELECT
         id,
         title,
         telegram_url,
         number_value,
         date_value,
         published_at,
         media_types
       FROM materials
       WHERE category_id = ? AND visibility = 'visible'
       ORDER BY ${orderBy}`,
    )
    .bind(categoryId)
    .all<PublicMaterialRow>();

  return results.map((material) => {
    let mediaTypes: string[] = [];
    try {
      const parsed = JSON.parse(material.media_types);
      if (Array.isArray(parsed)) {
        mediaTypes = parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      mediaTypes = [];
    }

    return {
      id: material.id,
      title: material.title,
      telegramUrl: material.telegram_url,
      numberValue: material.number_value,
      dateValue: material.date_value,
      publishedAt: material.published_at,
      mediaTypes,
    };
  });
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
         telegram_url_key,
         number_value,
         date_value
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.title,
        searchTitle,
        input.categoryId,
        input.telegramUrl,
        input.telegramUrl,
        input.numberValue ?? null,
        input.dateValue ?? null,
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
