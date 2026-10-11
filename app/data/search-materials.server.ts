import { normalizeSearchText } from "./material-content.server";
import type {
  SearchCategoryGroup,
  SearchFilters,
  SearchMaterialPage,
} from "./search-materials";

type SearchMaterialRow = {
  id: string;
  title: string;
  telegram_url: string;
  category_name: string;
  category_slug: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  media_types: string;
  content_text: string;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

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

const sentenceEndings = new Set(["։", ".", "!", "?", "…"]);

function findSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0 || needle.length > haystack.length) return -1;

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }

  return -1;
}

function createExcerpt(value: string, normalizedQuery: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  const characters = Array.from(compact);
  const normalizedCharacters = Array.from(compact.toLocaleLowerCase("hy-AM"));
  const candidates = [
    normalizedQuery,
    ...normalizedQuery
      .split(" ")
      .filter((term) => Array.from(term).length >= 2)
      .sort((first, second) => second.length - first.length),
  ].filter(Boolean);

  let matchStart = -1;
  let matchLength = 0;
  for (const candidate of candidates) {
    const candidateCharacters = Array.from(candidate);
    const index = findSequence(normalizedCharacters, candidateCharacters);
    if (index >= 0) {
      matchStart = index;
      matchLength = candidateCharacters.length;
      break;
    }
  }

  if (matchStart < 0) {
    return characters.length > 220
      ? `${characters.slice(0, 217).join("")}…`
      : compact;
  }

  let sentenceStart = matchStart;
  while (
    sentenceStart > 0 &&
    !sentenceEndings.has(characters[sentenceStart - 1])
  ) {
    sentenceStart -= 1;
  }
  let sentenceEnd = matchStart + matchLength;
  while (
    sentenceEnd < characters.length &&
    !sentenceEndings.has(characters[sentenceEnd])
  ) {
    sentenceEnd += 1;
  }
  if (sentenceEnd < characters.length) sentenceEnd += 1;

  const sentence = characters.slice(sentenceStart, sentenceEnd);
  if (sentence.length <= 280) return sentence.join("").trim();

  const windowStart = Math.max(sentenceStart, matchStart - 90);
  const windowEnd = Math.min(sentenceEnd, matchStart + matchLength + 150);
  return `${windowStart > sentenceStart ? "…" : ""}${characters
    .slice(windowStart, windowEnd)
    .join("")
    .trim()}${windowEnd < sentenceEnd ? "…" : ""}`;
}

function createSearchWhere(filters: SearchFilters, includeCategory: boolean) {
  const clauses = ["materials.visibility = 'visible'", "categories.is_active = 1"];
  const values: string[] = [];
  const normalizedQuery = normalizeSearchText(filters.query).slice(0, 120);
  const terms = normalizedQuery.split(" ").filter(Boolean).slice(0, 8);

  for (const term of terms) {
    const pattern = `%${escapeLike(term)}%`;
    clauses.push(
      "(materials.search_title LIKE ? ESCAPE '\\' OR materials.search_body LIKE ? ESCAPE '\\')",
    );
    values.push(pattern, pattern);
  }

  if (includeCategory && filters.categoryId) {
    clauses.push("materials.category_id = ?");
    values.push(filters.categoryId);
  }

  if (filters.mediaType === "text") {
    clauses.push("length(trim(materials.content_text)) > 0");
  } else if (filters.mediaType !== "all") {
    clauses.push("materials.media_types LIKE ?");
    values.push(`%\"${filters.mediaType}\"%`);
  }

  if (filters.dateFrom) {
    clauses.push("COALESCE(materials.date_value, substr(materials.published_at, 1, 10)) >= ?");
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("COALESCE(materials.date_value, substr(materials.published_at, 1, 10)) <= ?");
    values.push(filters.dateTo);
  }

  return { clauses, normalizedQuery, values };
}

export async function searchMaterialGroups(
  database: D1Database,
  filters: SearchFilters,
): Promise<SearchCategoryGroup[]> {
  const { clauses, values } = createSearchWhere(filters, false);
  const { results } = await database
    .prepare(
      `SELECT
         categories.id,
         categories.slug,
         categories.name,
         COUNT(materials.id) AS material_count
       FROM materials
       INNER JOIN categories ON categories.id = materials.category_id
       WHERE ${clauses.join(" AND ")}
       GROUP BY categories.id, categories.slug, categories.name, categories.sort_order
       HAVING COUNT(materials.id) > 0
       ORDER BY categories.sort_order ASC`,
    )
    .bind(...values)
    .all<{
      id: string;
      slug: string;
      name: string;
      material_count: number;
    }>();

  return results.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    materialCount: Number(row.material_count),
  }));
}

export async function searchMaterials(
  database: D1Database,
  filters: SearchFilters,
  page: number,
  pageSize = 30,
): Promise<SearchMaterialPage> {
  const {
    clauses,
    normalizedQuery,
    values: whereValues,
  } = createSearchWhere(filters, true);

  const rankValues: string[] = [];
  let relevance = "0";
  if (normalizedQuery) {
    relevance = `CASE
      WHEN materials.search_title = ? THEN 0
      WHEN materials.search_title LIKE ? ESCAPE '\\' THEN 1
      WHEN materials.search_title LIKE ? ESCAPE '\\' THEN 2
      ELSE 3
    END`;
    rankValues.push(
      normalizedQuery,
      `${escapeLike(normalizedQuery)}%`,
      `%${escapeLike(normalizedQuery)}%`,
    );
  }

  const selectStatement = database.prepare(
      `SELECT
         materials.id,
         materials.title,
         materials.telegram_url,
         materials.number_value,
         materials.date_value,
         materials.published_at,
         materials.media_types,
         materials.content_text,
         categories.name AS category_name,
         categories.slug AS category_slug,
         ${relevance} AS relevance
       FROM materials
       INNER JOIN categories ON categories.id = materials.category_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         relevance ASC,
         COALESCE(materials.date_value, materials.published_at, materials.created_at) DESC,
         materials.title COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`,
    );
  const countStatement = database.prepare(
    `SELECT COUNT(*) AS material_count
     FROM materials
     INNER JOIN categories ON categories.id = materials.category_id
     WHERE ${clauses.join(" AND ")}`,
  );
  const offset = (Math.max(page, 1) - 1) * pageSize;
  const [{ results }, countRow] = await Promise.all([
    selectStatement
      .bind(...rankValues, ...whereValues, pageSize, offset)
      .all<SearchMaterialRow>(),
    countStatement
      .bind(...whereValues)
      .first<{ material_count: number }>(),
  ]);

  return {
    materials: results.map((row) => ({
      id: row.id,
      title: row.title,
      telegramUrl: row.telegram_url,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      numberValue: row.number_value,
      dateValue: row.date_value,
      publishedAt: row.published_at,
      mediaTypes: parseMediaTypes(row.media_types),
      excerpt: createExcerpt(row.content_text, normalizedQuery),
    })),
    total: Number(countRow?.material_count ?? 0),
  };
}
