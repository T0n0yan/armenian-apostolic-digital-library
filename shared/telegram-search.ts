import type {
  BridgePost,
  BridgeRichBlock,
  BridgeRichInline,
  BridgeSearchHit,
  BridgeSearchHitSource,
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
  fields: Array<{ kind: SearchableTelegramFieldKind; value: string; primary: boolean; blockId: string | null }>;
};

/** `strength` breaks ties within a rank: 2 = title/primary field, 1 = topic or hashtag, 0 = body only. */
export type RankedTelegramSearchMatch = BridgeSearchMatch & { rank: number; strength?: number };

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
  ["gh", "ղ"], ["ou", "ու"], ["tch", "ճ"], ["sh", "շ"], ["zh", "ժ"], ["kh", "խ"], ["ts", "ծ"], ["dz", "ձ"], ["ch", "չ"], ["ev", "և"],
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
    .replace(/[՚-՟]/gu, "")
    .replace(/[։֍֎.,!?;:()[\]{}"'`´‘’‚‛“”„‟«»‹›—–-]+/gu, " ")
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

// Common informal Latin spellings mapped to the canonical forms that armenianToLatin indexes.
const latinSpellingPairs: Array<[string, string]> = [["gh", "x"], ["ou", "u"], ["tch", "ch"]];

export function searchAliases(value: string) {
  const normalized = normalizeTelegramSearchText(value);
  if (!normalized) return [];
  const aliases = new Set<string>();
  if (/\p{Script=Armenian}/u.test(normalized)) aliases.add(armenianToLatin(normalized));
  if (/\p{Script=Latin}/u.test(normalized)) {
    aliases.add(latinToArmenian(normalized));
    aliases.add(replacePairs(normalized, latinSpellingPairs));
  }
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

function addField(fields: SearchableTelegramDocument["fields"], kind: SearchableTelegramFieldKind, value: string | null | undefined, primary = primaryKinds.has(kind), blockId: string | null = null) {
  const clean = value?.trim();
  if (clean) fields.push({ kind, value: Array.from(clean).slice(0, 8_000).join(""), primary, blockId });
}

function inlineText(nodes: BridgeRichInline[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return node.text;
    if (node.type === "line-break") return "\n";
    if (node.type === "custom-emoji") return node.alt;
    if (node.type === "unsupported") return "";
    return inlineText(node.children);
  }).join("");
}

function addRichBlockFields(fields: SearchableTelegramDocument["fields"], blocks: BridgeRichBlock[], prefix = "block") {
  blocks.forEach((block, index) => {
    const blockId = `${prefix}-${index}`;
    if (block.type === "heading" || block.type === "paragraph" || block.type === "pre") {
      addField(fields, block.type === "heading" ? "title" : "body", inlineText(block.content), block.type === "heading", blockId);
    } else if (block.type === "blockquote") {
      addField(fields, "caption", inlineText(block.caption), false, `${blockId}-caption`);
      addRichBlockFields(fields, block.blocks, blockId);
    } else if (block.type === "list") {
      block.items.forEach((item, itemIndex) => addRichBlockFields(fields, item, `${blockId}-${itemIndex}`));
    } else if (block.type === "media") {
      addField(fields, "caption", inlineText(block.caption), false, `${blockId}-caption`);
    }
  });
}

export function createSearchableTelegramDocument(post: BridgePost, topicTitle = post.categoryName ?? ""): SearchableTelegramDocument {
  const fields: SearchableTelegramDocument["fields"] = [];
  addField(fields, "title", post.title);
  if (post.richContent) addRichBlockFields(fields, post.richContent.blocks);
  else {
    addField(fields, "body", post.contentText, false, "formatted-text");
    addField(fields, "caption", post.captionText, false, "formatted-caption");
  }
  addField(fields, "poll-question", post.poll?.question.text, true, "poll-question");
  for (const [index, option] of (post.poll?.options ?? []).entries()) addField(fields, "poll-option", option.text.text, false, `poll-option-${index}`);
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
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
const numericToken = /^\p{N}+$/u;
// Substring containment that never splits a number ("սաղմոս 1" must not hit "սաղմոս 14").
function includesWhole(value: string, query: string) {
  if (!/\p{N}/u.test(query)) return value.includes(query);
  return new RegExp(`(?<!\\p{N})${escapeRegExp(query)}(?!\\p{N})`, "u").test(value);
}
// Numbers never prefix-match ("1" must not find 10–19). In multi-word queries a number must
// follow the word before it ("սաղմոս 1"), so verse numbers elsewhere in a text don't match.
function prefixMatches(normalized: string, tokens: string[], terms: string[]) {
  return terms.every((term, index) => {
    if (!numericToken.test(term)) return tokens.some((token) => token.startsWith(term));
    if (index === 0) return tokens.includes(term);
    return new RegExp(`(?:^| )${escapeRegExp(terms[index - 1])}\\S* ${term}(?: |$)`, "u").test(normalized);
  });
}
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
  let bestHit: BridgeSearchHit | undefined; let strength = 0;
  for (const field of document.fields) {
    const normalized = normalizeTelegramSearchText(field.value);
    if (!normalized) continue;
    const tokens = normalized.split(" ").filter(Boolean).slice(0, 256);
    let fieldRank = 0;
    if (normalized === parsed.normalized && field.primary) fieldRank = 7;
    else if (tokenBoundaryIncludes(normalized, parsed.normalized)) fieldRank = 5;
    else if (parsed.tokens.length && prefixMatches(normalized, tokens, parsed.tokens)) fieldRank = 4;
    else if (includesWhole(normalized, parsed.normalized)) fieldRank = 3;
    if (!fieldRank) {
      const fieldAliases = searchAliases(normalized); const queryVariants = [parsed.normalized, ...parsed.aliases];
      if (fieldAliases.some((alias) => queryVariants.some((query) => tokenBoundaryIncludes(alias, query) || includesWhole(alias, query))) ||
          parsed.aliases.some((alias) => tokenBoundaryIncludes(normalized, alias) || includesWhole(normalized, alias))) {
        fieldRank = 2; usedTransliteration = true;
      }
    }
    if (!fieldRank && parsed.tokens.length > 0 && parsed.tokens.every((term) => {
      const threshold = fuzzyThreshold(term);
      return threshold > 0 && tokens.some((token) => boundedDistance(term, token, threshold) <= threshold);
    })) { fieldRank = 1; usedFuzzy = true; }
    if (fieldRank) {
      reasons.add(reasonByField[field.kind]);
      const hit = locateSearchHit(field.value, field.kind, field.blockId, parsed, fieldRank);
      if (fieldRank > bestRank || (fieldRank === bestRank && hit && (
        !bestHit || (bestHit.blockId === null && hit.blockId !== null) ||
        (bestHit.blockId === hit.blockId && hit.start < bestHit.start)
      ))) bestHit = hit ?? bestHit;
      const fieldStrength = field.primary ? 2 : field.kind === "topic" || field.kind === "hashtag" ? 1 : 0;
      if (fieldRank > bestRank) strength = fieldStrength;
      else if (fieldRank === bestRank) strength = Math.max(strength, fieldStrength);
      bestRank = Math.max(bestRank, fieldRank);
    }
  }
  if (!bestRank) return null;
  if (usedTransliteration && bestRank <= 2) reasons.add("transliteration");
  if (usedFuzzy && bestRank === 1) reasons.add("fuzzy");
  return { scoreCategory: category(bestRank), reasons: [...reasons], rank: bestRank, strength, hit: bestHit };
}

export function messageIdSearchMatch(messageId: number): RankedTelegramSearchMatch {
  return { scoreCategory: "message-id", reasons: ["telegram-id"], matchedMessageId: messageId, rank: scoreRank["message-id"] };
}

export function matchSearchableText(value: string, parsed: ParsedTelegramSearchQuery) {
  return matchSearchableTelegramDocument({
    chatId: "", messageId: 0, topicId: null, mediaGroupId: null, constituentMessageIds: [],
    fields: [{ kind: "body", value, primary: false, blockId: null }],
  }, parsed);
}

type NormalizedMap = { text: string; starts: number[]; ends: number[] };

function normalizedWithOriginalMap(value: string): NormalizedMap {
  const characters: Array<{ value: string; start: number; end: number }> = [];
  let offset = 0;
  for (const original of value) {
    const start = offset; offset += original.length;
    let normalized = original.normalize("NFKC").replace(/[\u0300-\u036f\u200B-\u200D\uFEFF]/gu, "").toLocaleLowerCase("hy-AM");
    if (/[՚-՟]/u.test(normalized)) normalized = "";
    else if (/[^\p{L}\p{N}]/u.test(normalized)) normalized = " ";
    for (const part of normalized) characters.push({ value: part, start, end: offset });
  }
  const collapsed: typeof characters = [];
  for (const character of characters) {
    if (character.value === " " && (collapsed.length === 0 || collapsed.at(-1)?.value === " ")) continue;
    collapsed.push(character);
  }
  while (collapsed[0]?.value === " ") collapsed.shift();
  while (collapsed.at(-1)?.value === " ") collapsed.pop();
  const equivalent: typeof characters = [];
  for (let index = 0; index < collapsed.length; index += 1) {
    if (collapsed[index]?.value === "ե" && collapsed[index + 1]?.value === "ւ") {
      equivalent.push({ value: "և", start: collapsed[index].start, end: collapsed[index + 1].end });
      index += 1;
    } else equivalent.push(collapsed[index]);
  }
  return { text: equivalent.map((item) => item.value).join(""), starts: equivalent.map((item) => item.start), ends: equivalent.map((item) => item.end) };
}

function sourceFor(kind: SearchableTelegramFieldKind): BridgeSearchHitSource {
  if (kind === "body") return "content";
  if (kind === "poll-question" || kind === "poll-option") return "poll";
  return kind;
}

function snippetFor(value: string, start: number, length: number) {
  const maximum = 260;
  let snippetStart = Math.max(0, start - 90);
  let snippetEnd = Math.min(value.length, start + length + 150);
  while (snippetStart > 0 && !/\s/u.test(value[snippetStart - 1]) && start - snippetStart < 120) snippetStart -= 1;
  while (snippetEnd < value.length && !/\s/u.test(value[snippetEnd]) && snippetEnd - start < 180) snippetEnd += 1;
  if (snippetEnd - snippetStart > maximum) snippetEnd = snippetStart + maximum;
  const prefix = snippetStart > 0 ? "…" : "";
  return {
    snippet: `${prefix}${value.slice(snippetStart, snippetEnd)}${snippetEnd < value.length ? "…" : ""}`,
    snippetStart,
    snippetMatchStart: prefix.length + start - snippetStart,
    snippetMatchLength: length,
  };
}

function locateSearchHit(value: string, kind: SearchableTelegramFieldKind, blockId: string | null, parsed: ParsedTelegramSearchQuery, rank: number): BridgeSearchHit | undefined {
  const mapped = normalizedWithOriginalMap(value);
  let normalizedStart = -1; let normalizedLength = 0;
  const directCandidates = [parsed.normalized, ...parsed.tokens].filter(Boolean).sort((a, b) => b.length - a.length);
  if (rank >= 3) {
    for (const candidate of directCandidates) {
      const index = mapped.text.indexOf(candidate);
      if (index >= 0) { normalizedStart = index; normalizedLength = candidate.length; break; }
    }
  }
  if (normalizedStart < 0) {
    const tokenPattern = /[^\s]+/gu; let tokenMatch: RegExpExecArray | null; let bestDistance = Number.POSITIVE_INFINITY;
    while ((tokenMatch = tokenPattern.exec(mapped.text))) {
      const token = tokenMatch[0];
      const variants = rank === 2 ? [armenianToLatin(token), latinToArmenian(token), token] : [token];
      for (const query of [parsed.normalized, ...parsed.aliases, ...parsed.tokens]) {
        for (const variant of variants) {
          const threshold = rank === 1 ? fuzzyThreshold(query) : 0;
          const distance = rank === 1 ? boundedDistance(query, variant, threshold) : (variant.includes(query) || query.includes(variant) ? 0 : threshold + 1);
          if (distance <= threshold && distance < bestDistance) {
            bestDistance = distance; normalizedStart = tokenMatch.index; normalizedLength = token.length;
          }
        }
      }
    }
  }
  if (normalizedStart < 0 || normalizedLength <= 0) return undefined;
  const start = mapped.starts[normalizedStart];
  const end = mapped.ends[Math.min(mapped.ends.length - 1, normalizedStart + normalizedLength - 1)];
  if (start === undefined || end === undefined || end <= start) return undefined;
  return { source: sourceFor(kind), blockId, start, length: end - start, ...snippetFor(value, start, end - start) };
}

export function searchScoreRank(value: BridgeSearchScoreCategory) { return scoreRank[value]; }
