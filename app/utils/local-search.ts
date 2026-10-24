/**
 * Searching titles on the phone. The site sends the title index once per content version
 * (/api/search-index: every material's title, section, number and picture, a few dozen KB); the
 * phone keeps it in its storage and searches it with no request at all. The texts themselves stay
 * on the server (the whole library's text would be megabytes): «Փնտրել նաև տեքստերում» asks the
 * server once, and so does a search no title answers.
 */
import {
  matchStoredSearchFields,
  normalizeTelegramSearchText,
  parseTelegramSearchQuery,
  searchAliases,
  type ParsedTelegramSearchQuery,
  type StoredSearchField,
} from "../../shared/telegram-search";
import type { BridgeContentType } from "../../shared/telegram-bridge-contract";
import type { SearchMaterial } from "../data/search-materials";
import { searchSuggestions } from "./search-suggestions";
import { contentVersionNow, rootSearchState } from "./search-state";

export { rootSearchState };

/** [id, path, title, section id, number, date, content type, picture, media count] */
export type SearchIndexItem = [string, string, string, string, number | null, string | null, string, string | null, number];
export type SearchIndex = { version: string; categories: Record<string, [string, string]>; items: SearchIndexItem[] };

type Prepared = { item: SearchIndexItem; fields: StoredSearchField[]; messageId: number };
type Loaded = { version: string; index: SearchIndex; prepared: Prepared[] };

const CACHE_NAME = "search-index";
let loaded: Loaded | null = null;
let loading: { version: string; promise: Promise<Loaded | null> } | null = null;

function indexUrl(version: string) {
  return `/api/search-index?v=${encodeURIComponent(version)}`;
}

async function fetchIndex(version: string): Promise<SearchIndex | null> {
  const url = indexUrl(version);
  // Kept in the phone's storage, so it survives closing the app; older versions are removed.
  const storage = typeof caches === "undefined" ? null : await caches.open(CACHE_NAME).catch(() => null);
  const kept = await storage?.match(url).catch(() => undefined);
  const response = kept ?? await fetch(url).catch(() => null);
  if (!response?.ok) return null;
  if (!kept && storage) {
    await storage.put(url, response.clone()).catch(() => undefined);
    for (const request of await storage.keys().catch(() => [] as Request[])) {
      if (!request.url.endsWith(url)) await storage.delete(request).catch(() => false);
    }
  }
  return await response.json().catch(() => null) as SearchIndex | null;
}

function prepare(index: SearchIndex): Prepared[] {
  const sectionNames = new Map(Object.entries(index.categories).map(([id, [name]]) => [id, normalizeTelegramSearchText(name)]));
  return index.items.map((item) => ({
    item,
    messageId: Number(/_(\d+)$/u.exec(item[0])?.[1] ?? 0),
    fields: [
      { kind: "title", normalized: normalizeTelegramSearchText(item[2]), aliases: "", primary: true, blockId: null },
      { kind: "topic", normalized: sectionNames.get(item[3]) ?? "", aliases: "", primary: false, blockId: null },
    ],
  }));
}

/** The title index for the current version, from the phone's storage or, once, from the site. */
export function loadSearchIndex(version = contentVersionNow()): Promise<Loaded | null> {
  if (!version) return Promise.resolve(null);
  if (loaded?.version === version) return Promise.resolve(loaded);
  if (loading?.version === version) return loading.promise;
  const promise = fetchIndex(version).then((index) => {
    if (!index?.items) return null;
    loaded = { version, index, prepared: prepare(index) };
    return loaded;
  }).catch(() => null).finally(() => { if (loading?.promise === promise) loading = null; });
  loading = { version, promise };
  return promise;
}

/** What readers type in English or Russian, and the Armenian words the library uses. */
const FOREIGN_TERMS: Array<[string[], string]> = [
  [["prayer", "prayers", "pray", "молитва", "молитвы"], "Աղոթք"],
  [["psalm", "psalms", "псалом", "псалмы", "псалтырь"], "Սաղմոս"],
  [["our father", "lord's prayer", "lords prayer", "отче наш"], "Հայր մեր"],
  [["gospel", "evangel", "евангелие"], "Ավետարան"],
  [["saint", "saints", "святой", "святая", "святые"], "Սուրբ"],
  [["jesus", "christ", "jesus christ", "иисус", "христос", "иисус христос"], "Հիսուս Քրիստոս"],
  [["mary", "virgin mary", "мария", "богородица", "дева мария"], "Սուրբ Մարիամ Աստվածածին"],
  [["holy spirit", "святой дух"], "Սուրբ Հոգի"],
  [["cross", "holy cross", "крест"], "Սուրբ Խաչ"],
  [["christmas", "nativity", "рождество"], "Սուրբ Ծնունդ"],
  [["easter", "resurrection", "пасха", "воскресение"], "Սուրբ Զատիկ"],
  [["ascension", "вознесение"], "Համբարձում"],
  [["transfiguration", "преображение"], "Վարդավառ"],
  [["parable", "притча"], "Առակ"],
  [["daily reading", "readings", "чтение", "чтения"], "Օրվա ընթերցումներ"],
  [["repentance", "покаяние"], "Ապաշխարություն"],
  [["faith", "вера"], "Հավատք"],
  [["love", "любовь"], "Սեր"],
  [["hope", "надежда"], "Հույս"],
  [["forgiveness", "прощение"], "Ներում"],
  [["gregory the illuminator", "григорий просветитель"], "Սուրբ Գրիգոր Լուսավորիչ"],
  [["narekatsi", "narek", "нарекаци", "нарек"], "Սուրբ Գրիգոր Նարեկացի"],
  [["shnorhali", "шнорали"], "Սուրբ Ներսես Շնորհալի"],
];
const FOREIGN = new Map(FOREIGN_TERMS.flatMap(([words, armenian]) => words.map((word) => [word, armenian] as const)));

/** An English or Russian search for a known word becomes the Armenian one ("prayer" → «Աղոթք»). */
export function translateQuery(query: string) {
  const value = query.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
  const exact = FOREIGN.get(value);
  if (exact) return exact;
  // The start of one known word ("молит", "praye") means that word.
  const started = value.length >= 4 ? foreignSuggestions(value) : [];
  return started.length === 1 ? started[0] : query;
}

/** English and Russian words that start with what was typed, as the Armenian terms they mean. */
export function foreignSuggestions(typed: string) {
  const value = typed.trim().toLocaleLowerCase();
  if (value.length < 2 || /\p{Script=Armenian}/u.test(value)) return [];
  return [...new Set(FOREIGN_TERMS.filter(([words]) => words.some((word) => word.startsWith(value))).map(([, armenian]) => armenian))];
}

/** Suggestion words: the sections, the common terms and every material title. */
export function indexSuggestionTerms(index: SearchIndex) {
  const dateTitle = /^\d{1,2}\s+\p{L}+,?\s+\d{4}$/u;
  const titles = index.items.map((item) => item[2].replace(/[​-‍﻿]/gu, "").replace(/\s+/gu, " ").trim())
    .filter((title) => title.length >= 3 && title.length <= 80 && !dateTitle.test(title));
  return [...new Set([...searchSuggestions(Object.values(index.categories).map(([name]) => name)), ...titles])];
}

// Latin letters that stand for more than one Armenian letter ("t" is տ or թ, "p" պ or փ…).
const AMBIGUOUS: Array<[string, string]> = [["տ", "թ"], ["պ", "փ"], ["կ", "ք"], ["ր", "ռ"], ["ե", "է"], ["ո", "օ"], ["չ", "ճ"], ["ց", "ծ"]];

function withLatinReadings(parsed: ParsedTelegramSearchQuery): ParsedTelegramSearchQuery {
  if (!/\p{Script=Latin}/u.test(parsed.normalized)) return parsed;
  const readings = new Set(searchAliases(parsed.normalized));
  for (const reading of [...readings]) {
    if (!/\p{Script=Armenian}/u.test(reading)) continue;
    for (const [from, to] of AMBIGUOUS) if (reading.includes(from)) readings.add(reading.replaceAll(from, to));
  }
  return { ...parsed, aliases: [...readings].slice(0, 16) };
}

function toMaterial(index: SearchIndex, item: SearchIndexItem, scoreCategory: SearchMaterial["scoreCategory"]): SearchMaterial {
  const [id, , title, categoryId, number, date, contentType, thumbnail, mediaCount] = item;
  const [categoryName, categorySlug] = index.categories[categoryId] ?? ["", ""];
  return {
    id, title, telegramUrl: "", categoryName, categorySlug, numberValue: number, dateValue: null, publishedAt: date,
    mediaTypes: [], excerpt: null, contentType: contentType as BridgeContentType, scoreCategory,
    matchReasons: ["telegram", "title"],
    preview: {
      thumbnailUrl: thumbnail, imageUrl: contentType === "photo" ? thumbnail : null, width: null, height: null, mediaCount,
      duration: null, mediaTitle: null, performer: null, pollQuestion: null, pollOptionCount: null,
      locationTitle: null, locationSummary: null, unsupportedType: null, daily: null,
    },
  };
}

const MAX_RESULTS = 100;

/** Titles that answer the query, best first (psalms of one rank in their own order). */
export function searchTitles(index: Loaded, query: string, categoryId = ""): SearchMaterial[] {
  const parsed = withLatinReadings(parseTelegramSearchQuery(translateQuery(query)));
  const candidates = index.prepared.filter((entry) => !categoryId || entry.item[3] === categoryId);
  const number = parsed.messageIdIntent?.messageId;
  if (number) {
    // A bare number: a psalm's number, or a post's own Telegram number.
    return candidates.filter((entry) => entry.item[4] === number || entry.messageId === number)
      .slice(0, MAX_RESULTS).map((entry) => toMaterial(index.index, entry.item, "message-id"));
  }
  return candidates.flatMap((entry) => {
    const match = matchStoredSearchFields(entry.fields, parsed);
    // A section's name alone ("աղոթք") would list the whole section: only titles count.
    return match && match.fieldIndex === 0 ? [{ entry, match }] : [];
  }).sort((left, right) =>
    right.match.rank - left.match.rank ||
    (left.entry.item[3] === right.entry.item[3] && left.entry.item[4] !== null && right.entry.item[4] !== null ? left.entry.item[4] - right.entry.item[4] : 0) ||
    (right.entry.item[5] ?? "").localeCompare(left.entry.item[5] ?? ""),
  ).slice(0, MAX_RESULTS).map(({ entry, match }) => toMaterial(index.index, entry.item, match.scoreCategory));
}
