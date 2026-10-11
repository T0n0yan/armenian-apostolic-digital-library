import { normalizeSearchText } from "./material-content.server";

export type ResolvedSearchQuery = {
  original: string;
  normalized: string;
  correctedQuery: string;
  highlightQuery: string;
  telegramUrlKey: string;
  termGroups: string[][];
};

let vocabularyCache: { expiresAt: number; words: string[] } | null = null;

function normalizeTelegramUrl(value: string) {
  const candidate = value.trim().replace(/^telegram\.me\//i, "https://t.me/");
  const withProtocol = /^t\.me\//i.test(candidate)
    ? `https://${candidate}`
    : candidate;
  try {
    const url = new URL(withProtocol);
    if (!["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(url.hostname.toLowerCase())) {
      return "";
    }
    const path = url.pathname.replace(/\/+$/u, "");
    return path ? `https://t.me${path}` : "";
  } catch {
    return "";
  }
}

function distance(first: string, second: string) {
  const left = Array.from(first);
  const right = Array.from(second);
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + cost,
        );
      }
    }
  }
  return matrix[left.length][right.length];
}

async function getVocabulary(database: D1Database) {
  if (vocabularyCache && vocabularyCache.expiresAt > Date.now()) {
    return vocabularyCache.words;
  }
  const { results } = await database
    .prepare(
      `SELECT search_title AS value FROM materials WHERE visibility = 'visible'
       UNION ALL
       SELECT lower(name) AS value FROM categories WHERE is_active = 1`,
    )
    .all<{ value: string }>();
  const words = Array.from(
    new Set(
      results.flatMap((row) =>
        normalizeSearchText(row.value)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => Array.from(word).length >= 4),
      ),
    ),
  );
  vocabularyCache = { expiresAt: Date.now() + 5 * 60_000, words };
  return words;
}

function correctionFor(term: string, words: string[]) {
  const length = Array.from(term).length;
  if (length < 4 || words.includes(term)) return "";
  const threshold = length <= 5 ? 1 : length <= 9 ? 2 : 3;
  let best = "";
  let bestDistance = threshold + 1;
  for (const word of words) {
    if (Math.abs(Array.from(word).length - length) > threshold) continue;
    const current = distance(term, word);
    if (current < bestDistance) {
      best = word;
      bestDistance = current;
      if (current === 1) break;
    }
  }
  return bestDistance <= threshold ? best : "";
}

export async function resolveSearchQuery(
  database: D1Database,
  query: string,
): Promise<ResolvedSearchQuery> {
  const original = query.trim().slice(0, 120);
  const telegramUrlKey = normalizeTelegramUrl(original);
  const normalized = normalizeSearchText(original).slice(0, 120);
  if (!normalized || telegramUrlKey) {
    return {
      original,
      normalized,
      correctedQuery: "",
      highlightQuery: normalized,
      telegramUrlKey,
      termGroups: [],
    };
  }

  const terms = normalized.split(" ").filter(Boolean).slice(0, 8);
  const words = await getVocabulary(database);
  let changed = false;
  const correctedTerms = terms.map((term) => {
    const correction = correctionFor(term, words);
    if (correction && correction !== term) changed = true;
    return correction || term;
  });
  const termGroups = terms.map((term, index) =>
    term === correctedTerms[index] ? [term] : [term, correctedTerms[index]],
  );
  const correctedQuery = changed ? correctedTerms.join(" ") : "";
  return {
    original,
    normalized,
    correctedQuery,
    highlightQuery: correctedQuery || normalized,
    telegramUrlKey,
    termGroups,
  };
}
