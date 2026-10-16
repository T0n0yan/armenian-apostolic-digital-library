import type {
  BridgePost,
  BridgeSearchMatch,
  BridgeSearchMatchReason,
  BridgeSearchScoreCategory,
} from "./telegram-bridge-contract";

export type ParsedTelegramSearchQuery = {
  original: string;
  normalized: string;
  tokens: string[];
  aliases: string[];
  messageIdIntent: { kind: "message-id"; messageId: number; explicit: boolean } | null;
};

export type SearchableTelegramFieldKind =
  | "title" | "body" | "caption" | "poll-question" | "poll-option"
  | "location" | "audio" | "document" | "topic" | "hashtag";

export type SearchableTelegramDocument = {
  chatId: string;
  messageId: number;
  topicId: number | null;
  mediaGroupId: string | null;
  constituentMessageIds: number[];
  fields: Array<{ kind: SearchableTelegramFieldKind; value: string; primary: boolean }>;
};

export type RankedTelegramSearchMatch = BridgeSearchMatch & { rank: number };

const primaryKinds = new Set<SearchableTelegramFieldKind>(["title", "poll-question", "location", "audio"]);
const reasonByField: Record<SearchableTelegramFieldKind, BridgeSearchMatchReason> = {
  title: "title", body: "body", caption: "caption", "poll-question": "poll-question",
  "poll-option": "poll-option", location: "location", audio: "audio", document: "document",
  topic: "topic", hashtag: "hashtag",
};
const scoreRank: Record<BridgeSearchScoreCategory, number> = {
  "message-id": 8, "exact-primary": 7, "exact-token": 5, prefix: 4,
  content: 3, transliteration: 2, fuzzy: 1,
};

const armenianToLatinPairs: Array<[string, string]> = [
  ["ու", "u"], ["և", "ev"], ["շ", "sh"], ["ժ", "zh"], ["խ", "kh"], ["ծ", "ts"],
  ["ճ", "ch"], ["չ", "ch"], ["ձ", "dz"], ["ա", "a"], ["բ", "b"], ["գ", "g"], ["դ", "d"],
  ["ե", "e"], ["զ", "z"], ["է", "e"], ["ը", "y"], ["թ", "t"], ["ի", "i"], ["լ", "l"],
  ["կ", "k"], ["հ", "h"], ["ղ", "x"], ["մ", "m"], ["յ", "y"], ["ն", "n"], ["ո", "o"],
  ["պ", "p"], ["ջ", "j"], ["ռ", "r"], ["ս", "s"], ["վ", "v"], ["տ", "t"], ["ր", "r"],
  ["ց", "c"], ["փ", "p"], ["ք", "q"], ["օ", "o"], ["ֆ", "f"],
];
const latinToArmenianPairs: Array<[string, string]> = [
  ["sh", "շ"], ["zh", "ժ"], ["kh", "խ"], ["ts", "ծ"], ["dz", "ձ"], ["ch", "չ"], ["ev", "և"],
  ["a", "ա"], ["b", "բ"], ["c", "ց"], ["d", "դ"], ["e", "ե"], ["f", "ֆ"], ["g", "գ"],
  ["h", "հ"], ["i", "ի"], ["j", "ջ"], ["k", "կ"], ["l", "լ"], ["m", "մ"], ["n", "ն"],
  ["o", "ո"], ["p", "պ"], ["q", "ք"], ["r", "ր"], ["s", "ս"], ["t", "տ"], ["u", "ու"],
  ["v", "վ"], ["w", "վ"], ["x", "ղ"], ["y", "յ"], ["z", "զ"],
];

function replacePairs(value: string, pairs: Array<[string, string]>) {
  let output = value;
  for (const [source, target] of pairs) output = output.replaceAll(source, target);
  return output;
}

export function normalizeTelegramSearchText(value: string) {
  return value.normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[՚-՟։֍֎.,!?;:()[\]{}"'`´‘’‚‛“”„‟«»‹›—–-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("hy-AM")
    .replace(/եւ/gu, "և")
    .trim();
}

export function armenianToLatin(value: string) {
  return replacePairs(normalizeTelegramSearchText(value), armenianToLatinPairs).replace(/\s+/gu, " ").trim();
}

export function latinToArmenian(value: string) {
  return replacePairs(normalizeTelegramSearchText(value), latinToArmenianPairs).replace(/\s+/gu, " ").trim();
}

export function searchAliases(value: string) {
  const normalized = normalizeTelegramSearchText(value);
  if (!normalized) return [];
  const aliases = new Set<string>();
  if (/\p{Script=Armenian}/u.test(normalized)) aliases.add(armenianToLatin(normalized));
  if (/\p{Script=Latin}/u.test(normalized)) aliases.add(latinToArmenian(normalized));
  aliases.delete(""); aliases.delete(normalized);
  return [...aliases];
}

export function parseTelegramSearchQuery(value: string): ParsedTelegramSearchQuery {
  const original = Array.from(value.trim()).slice(0, 120).join("");
  const idMatch = /^(?:(#|id\s*:|tg\s*:)?\s*)(\d{1,10})$/iu.exec(original);
  const parsedId = idMatch ? Number(idMatch[2]) : 0;
  const messageIdIntent = idMatch && Number.isSafeInteger(parsedId) && parsedId > 0
    ? { kind: "message-id" as const, messageId: parsedId, explicit: Boolean(idMatch[1]) }
    : null;
  const normalized = normalizeTelegramSearchText(original);
  return { original, normalized, tokens: normalized.split(" ").filter(Boolean).slice(0, 12), aliases: searchAliases(normalized), messageIdIntent };
}

function addField(fields: SearchableTelegramDocument["fields"], kind: SearchableTelegramFieldKind, value: string | null | undefined, primary = primaryKinds.has(kind)) {
  const clean = value?.trim();
  if (clean) fields.push({ kind, value: Array.from(clean).slice(0, 8_000).join(""), primary });
}

export function createSearchableTelegramDocument(post: BridgePost, topicTitle = post.categoryName ?? ""): SearchableTelegramDocument {
  const fields: SearchableTelegramDocument["fields"] = [];
  addField(fields, "title", post.title);
  addField(fields, "body", post.contentText, false);
  addField(fields, "caption", post.captionText, false);
  addField(fields, "poll-question", post.poll?.question.text);
  for (const option of post.poll?.options ?? []) addField(fields, "poll-option", option.text.text, false);
  addField(fields, "location", post.location?.title);
  addField(fields, "location", post.location?.address, false);
  for (const media of post.media) {
    addField(fields, "audio", media.title);
    addField(fields, "audio", media.performer, false);
    addField(fields, "document", media.fileName, false);
  }
  addField(fields, "topic", topicTitle, false);
  for (const tag of post.tags) addField(fields, "hashtag", tag, false);
  return {
    chatId: post.chatId, messageId: post.messageId, topicId: post.topicId ?? post.forumTopicId,
    mediaGroupId: post.mediaGroupId,
    constituentMessageIds: post.constituentMessageIds.length ? post.constituentMessageIds : [post.messageId], fields,
  };
}

function boundedDistance(first: string, second: string, maximum: number) {
  const left = Array.from(first); const right = Array.from(second);
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]; let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const value = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
      current[column] = value; rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function tokenBoundaryIncludes(value: string, query: string) { return ` ${value} `.includes(` ${query} `); }
function fuzzyThreshold(token: string) { const length = Array.from(token).length; return length >= 8 ? 2 : length >= 4 ? 1 : 0; }
function category(rank: number): BridgeSearchScoreCategory {
  if (rank >= 7) return "exact-primary";
  if (rank === 5) return "exact-token";
  if (rank === 4) return "prefix";
  if (rank === 3) return "content";
  if (rank === 2) return "transliteration";
  return "fuzzy";
}

export function matchSearchableTelegramDocument(document: SearchableTelegramDocument, parsed: ParsedTelegramSearchQuery): RankedTelegramSearchMatch | null {
  if (!parsed.normalized || parsed.messageIdIntent) return null;
  let bestRank = 0; const reasons = new Set<BridgeSearchMatchReason>(); let usedTransliteration = false; let usedFuzzy = false;
  for (const field of document.fields) {
    const normalized = normalizeTelegramSearchText(field.value);
    if (!normalized) continue;
    const tokens = normalized.split(" ").filter(Boolean).slice(0, 256);
    let fieldRank = 0;
    if (normalized === parsed.normalized && field.primary) fieldRank = 7;
    else if (tokenBoundaryIncludes(normalized, parsed.normalized)) fieldRank = 5;
    else if (parsed.tokens.length && parsed.tokens.every((term) => tokens.some((token) => token.startsWith(term)))) fieldRank = 4;
    else if (normalized.includes(parsed.normalized)) fieldRank = 3;
    if (!fieldRank) {
      const fieldAliases = searchAliases(normalized); const queryVariants = [parsed.normalized, ...parsed.aliases];
      if (fieldAliases.some((alias) => queryVariants.some((query) => tokenBoundaryIncludes(alias, query) || alias.includes(query))) ||
          parsed.aliases.some((alias) => tokenBoundaryIncludes(normalized, alias) || normalized.includes(alias))) {
        fieldRank = 2; usedTransliteration = true;
      }
    }
    if (!fieldRank && parsed.tokens.length > 0 && parsed.tokens.every((term) => {
      const threshold = fuzzyThreshold(term);
      return threshold > 0 && tokens.some((token) => boundedDistance(term, token, threshold) <= threshold);
    })) { fieldRank = 1; usedFuzzy = true; }
    if (fieldRank) { bestRank = Math.max(bestRank, fieldRank); reasons.add(reasonByField[field.kind]); }
  }
  if (!bestRank) return null;
  if (usedTransliteration && bestRank <= 2) reasons.add("transliteration");
  if (usedFuzzy && bestRank === 1) reasons.add("fuzzy");
  return { scoreCategory: category(bestRank), reasons: [...reasons], rank: bestRank };
}

export function messageIdSearchMatch(messageId: number): RankedTelegramSearchMatch {
  return { scoreCategory: "message-id", reasons: ["telegram-id"], matchedMessageId: messageId, rank: scoreRank["message-id"] };
}

export function matchSearchableText(value: string, parsed: ParsedTelegramSearchQuery) {
  return matchSearchableTelegramDocument({
    chatId: "", messageId: 0, topicId: null, mediaGroupId: null, constituentMessageIds: [],
    fields: [{ kind: "body", value, primary: false }],
  }, parsed);
}

export function searchScoreRank(value: BridgeSearchScoreCategory) { return scoreRank[value]; }
