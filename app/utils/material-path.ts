import { createMaterialId, parseMaterialId, resolveContentCategoryId, type ContentCategoryId } from "../../shared/telegram-bridge-contract";
import { normalizeTelegramSearchText } from "../../shared/telegram-search";

/** The library's Telegram group; its posts get the site's own readable addresses. */
export const LIBRARY_CHAT_ID = "-1002993860753";

/**
 * Readable section addresses (Armenian in Latin letters). They follow the content section, not
 * the Telegram topic's name, so renaming a topic in Telegram never changes them.
 */
export const SECTION_SLUGS: Record<ContentCategoryId, string> = {
  category_psalms: "saghmosner",
  category_prayers: "aghotkner",
  category_saints_lives: "srberi-varq",
  category_gospel_teachings: "avetarani-usutsum",
  category_daily_readings: "orva-entertsumner",
  category_bible_questions: "hartser",
};
/** Materials of other topics live under this section. */
export const OTHER_SECTION = "nyut";
const SECTION_TO_CATEGORY = new Map(Object.entries(SECTION_SLUGS).map(([id, slug]) => [slug, id as ContentCategoryId]));

export function categoryForSection(section: string) {
  return SECTION_TO_CATEGORY.get(section) ?? null;
}

export function isMaterialSection(section: string) {
  return SECTION_TO_CATEGORY.has(section) || section === OTHER_SECTION;
}

function sectionOf(category: string | null | undefined) {
  const id = resolveContentCategoryId(category, category);
  return id ? SECTION_SLUGS[id] : null;
}

/** A section's address: "/saghmosner"; other topics keep "/categories/<slug>". */
export function sectionPath(category: { id?: string | null; name?: string | null; slug: string }) {
  const id = resolveContentCategoryId(category.id, category.name);
  return id ? `/${SECTION_SLUGS[id]}` : `/categories/${category.slug}`;
}

// Readable Latin letters for addresses (not the compact search transliteration).
const SLUG_LETTERS: Record<string, string> = {
  ա: "a", բ: "b", գ: "g", դ: "d", ե: "e", զ: "z", է: "e", ը: "y", թ: "t", ժ: "zh", ի: "i", լ: "l", խ: "kh", ծ: "ts",
  կ: "k", հ: "h", ձ: "dz", ղ: "gh", ճ: "ch", մ: "m", յ: "y", ն: "n", շ: "sh", ո: "o", չ: "ch", պ: "p", ջ: "j", ռ: "r",
  ս: "s", վ: "v", տ: "t", ր: "r", ց: "ts", ւ: "v", փ: "p", ք: "k", և: "ev", օ: "o", ֆ: "f",
};

function toLatin(value: string) {
  return value.replace(/ու/gu, "u").replace(/./gu, (letter) => SLUG_LETTERS[letter] ?? letter);
}

/** A title in Latin letters for an address: "Աղոթք ընտանիքի" → "aghotk-yntaniki". */
export function titleSlug(title: string | null | undefined) {
  if (!title?.trim()) return "";
  const words = toLatin(normalizeTelegramSearchText(title)).toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim().split(" ").filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 60) break;
    slug = next;
  }
  return slug;
}

/**
 * A material's address: a psalm by its number ("/saghmosner/22"), anything else by its id and
 * title ("/aghotkner/364-aghotk-yntaniki"). `category` is a section id or name.
 */
export function materialPath(id: string, category?: string | null, details: { title?: string | null; psalm?: number | null } = {}) {
  const reference = parseMaterialId(id);
  if (!reference || reference.chatId !== LIBRARY_CHAT_ID) return `/materials/${id}`;
  const section = sectionOf(category) ?? OTHER_SECTION;
  if (section === SECTION_SLUGS.category_psalms && details.psalm) return `/${section}/${details.psalm}`;
  const slug = titleSlug(details.title) || (section === SECTION_SLUGS.category_psalms ? "saghmos" : "");
  return `/${section}/${reference.messageId}${slug ? `-${slug}` : ""}`;
}

/** What an item segment names: a psalm number ("22") or a post ("364-aghotk-yntaniki"). */
export function parseItemSegment(section: string, item: string): { psalm: number } | { materialId: string } | null {
  if (section === SECTION_SLUGS.category_psalms && /^\d{1,3}$/u.test(item)) return { psalm: Number(item) };
  const match = /^(\d{1,12})(?:-[a-z0-9-]*)?$/u.exec(item);
  return match ? { materialId: createMaterialId(LIBRARY_CHAT_ID, Number(match[1])) } : null;
}

const OLD_SHORT_PATH = /^(pray|psalm|saint|gospel|day|quiz|post)_(\d{1,12})$/u;

/** The material behind an old short address ("pray_364"); those redirect to the readable one. */
export function materialIdFromShortPath(segment: string) {
  const match = OLD_SHORT_PATH.exec(segment);
  return match ? createMaterialId(LIBRARY_CHAT_ID, Number(match[2])) : null;
}

/** Pages the edge may cache: sections, materials and old short addresses. */
export function isLibraryPath(pathname: string) {
  const [first = "", second] = pathname.replace(/^\//u, "").split("/");
  if (OLD_SHORT_PATH.test(first)) return true;
  if (!isMaterialSection(first)) return false;
  return second === undefined || /^[a-z0-9-]{1,80}$/u.test(second);
}
