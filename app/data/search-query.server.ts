import { parseTelegramSearchQuery, type ParsedTelegramSearchQuery } from "../../shared/telegram-search";

export type ResolvedSearchQuery = ParsedTelegramSearchQuery & {
  correctedQuery: string;
  highlightQuery: string;
  telegramUrlKey: string;
  termGroups: string[][];
};

function normalizeTelegramUrl(value: string) {
  const candidate = value.trim().replace(/^telegram\.me\//iu, "https://t.me/");
  const withProtocol = /^t\.me\//iu.test(candidate) ? `https://${candidate}` : candidate;
  try {
    const url = new URL(withProtocol);
    if (!["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(url.hostname.toLowerCase())) return "";
    const path = url.pathname.replace(/\/+$/u, "");
    return path ? `https://t.me${path}` : "";
  } catch { return ""; }
}

export async function resolveSearchQuery(_database: D1Database, query: string): Promise<ResolvedSearchQuery> {
  const parsed = parseTelegramSearchQuery(query);
  const correctedQuery = parsed.aliases[0] ?? "";
  return {
    ...parsed,
    correctedQuery,
    highlightQuery: correctedQuery || parsed.normalized,
    telegramUrlKey: normalizeTelegramUrl(parsed.original),
    termGroups: parsed.tokens.map((term) => [term]),
  };
}
