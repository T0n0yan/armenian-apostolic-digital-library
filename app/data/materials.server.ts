import {
  createContentFingerprint,
  normalizeContentText,
  normalizeSearchText,
} from "./material-content.server";

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
  contentText?: string;
};

export type ManualMaterialConstraints = {
  nextPsalmNumber: number;
  usedDailyDates: string[];
  usedTitlesByCategory: Record<string, string[]>;
};

const UNIQUE_TITLE_CATEGORY_IDS = [
  "category_saints_lives",
  "category_gospel_teachings",
  "category_bible_questions",
  "category_holy_sites_armenia",
] as const;

export class MaterialWriteError extends Error {
  constructor(
    public readonly code:
      | "category-not-found"
      | "duplicate-telegram-url"
      | "psalm-out-of-sequence"
      | "duplicate-psalm-number"
      | "duplicate-date"
      | "duplicate-title"
      | "duplicate-content",
  ) {
    super(code);
    this.name = "MaterialWriteError";
  }
}

export async function getManualMaterialConstraints(
  database: D1Database,
): Promise<ManualMaterialConstraints> {
  const [psalmRow, dailyRows, titleRows] = await Promise.all([
    database
      .prepare(
        `SELECT COALESCE(MAX(number_value), 0) AS max_number
         FROM materials
         WHERE category_id = 'category_psalms'`,
      )
      .first<{ max_number: number }>(),
    database
      .prepare(
        `SELECT date_value
         FROM materials
         WHERE category_id = 'category_daily_readings'
           AND date_value IS NOT NULL
         ORDER BY date_value`,
      )
      .all<{ date_value: string }>(),
    database
      .prepare(
        `SELECT category_id, search_title
         FROM materials
         WHERE category_id IN (?, ?, ?, ?)
         ORDER BY category_id, search_title`,
      )
      .bind(...UNIQUE_TITLE_CATEGORY_IDS)
      .all<{ category_id: string; search_title: string }>(),
  ]);

  const usedTitlesByCategory: Record<string, string[]> = {};
  for (const row of titleRows.results) {
    (usedTitlesByCategory[row.category_id] ??= []).push(row.search_title);
  }

  return {
    nextPsalmNumber: Number(psalmRow?.max_number ?? 0) + 1,
    usedDailyDates: dailyRows.results.map((row) => row.date_value),
    usedTitlesByCategory,
  };
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
  const searchTitle = normalizeSearchText(input.title);
  const contentText = normalizeContentText(input.contentText ?? "");
  const searchBody = normalizeSearchText(contentText);
  const contentFingerprint = await createContentFingerprint(contentText);
  let sortOrder = 0;

  if (input.categoryId === "category_saints_lives") {
    const row = await database
      .prepare(
        `SELECT COALESCE(MAX(sort_order), 40) AS max_sort_order
         FROM materials
         WHERE category_id = 'category_saints_lives'
           AND visibility = 'visible'`,
      )
      .first<{ max_sort_order: number }>();
    sortOrder = Math.max(Number(row?.max_sort_order ?? 40), 40) + 10;
  }

  if (input.categoryId === "category_psalms") {
    const row = await database
      .prepare(
        `SELECT COALESCE(MAX(number_value), 0) AS max_number
         FROM materials
         WHERE category_id = 'category_psalms'`,
      )
      .first<{ max_number: number }>();
    const nextPsalmNumber = Number(row?.max_number ?? 0) + 1;
    if ((input.numberValue ?? 0) < nextPsalmNumber) {
      throw new MaterialWriteError("psalm-out-of-sequence");
    }
  }

  if (input.categoryId === "category_daily_readings" && input.dateValue) {
    const existing = await database
      .prepare(
        `SELECT id FROM materials
         WHERE category_id = 'category_daily_readings' AND date_value = ?`,
      )
      .bind(input.dateValue)
      .first<{ id: string }>();
    if (existing) throw new MaterialWriteError("duplicate-date");
  }

  if (
    UNIQUE_TITLE_CATEGORY_IDS.includes(
      input.categoryId as (typeof UNIQUE_TITLE_CATEGORY_IDS)[number],
    )
  ) {
    const existing = await database
      .prepare(
        `SELECT id FROM materials
         WHERE category_id = ? AND search_title = ?`,
      )
      .bind(input.categoryId, searchTitle)
      .first<{ id: string }>();
    if (existing) throw new MaterialWriteError("duplicate-title");
  }

  if (input.categoryId === "category_prayers" && contentFingerprint) {
    const existing = await database
      .prepare(
        `SELECT id FROM materials
         WHERE category_id = 'category_prayers' AND content_fingerprint = ?`,
      )
      .bind(contentFingerprint)
      .first<{ id: string }>();
    if (existing) throw new MaterialWriteError("duplicate-content");
  }

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
         date_value,
         sort_order,
         content_kind,
         content_text,
         search_body,
         content_fingerprint
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sortOrder,
        contentText ? "text" : null,
        contentText,
        searchBody,
        contentFingerprint,
      )
      .run();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("materials.telegram_url_key")
    ) {
      throw new MaterialWriteError("duplicate-telegram-url");
    }

    if (error instanceof Error) {
      if (
        error.message.includes("idx_materials_unique_psalm_number") ||
        error.message.includes("materials.category_id, materials.number_value")
      ) {
        throw new MaterialWriteError("duplicate-psalm-number");
      }
      if (
        error.message.includes("idx_materials_unique_daily_date") ||
        error.message.includes("materials.category_id, materials.date_value")
      ) {
        throw new MaterialWriteError("duplicate-date");
      }
      if (
        error.message.includes("idx_materials_unique_named_category_title") ||
        error.message.includes("materials.category_id, materials.search_title")
      ) {
        throw new MaterialWriteError("duplicate-title");
      }
      if (
        error.message.includes("idx_materials_unique_prayer_content") ||
        error.message.includes("materials.category_id, materials.content_fingerprint")
      ) {
        throw new MaterialWriteError("duplicate-content");
      }
    }

    throw error;
  }

  return { id };
}
