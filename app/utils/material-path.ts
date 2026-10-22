import { createMaterialId, parseMaterialId, resolveContentCategoryId, type ContentCategoryId } from "../../shared/telegram-bridge-contract";

/** The library's Telegram group; its posts get the site's own readable addresses. */
export const LIBRARY_CHAT_ID = "-1002993860753";

/**
 * Section addresses: short English words. They follow the content section, not the Telegram
 * topic's name, so renaming a topic in Telegram never changes them.
 */
export const SECTION_SLUGS: Record<ContentCategoryId, string> = {
  category_psalms: "psalms",
  category_prayers: "pray",
  category_saints_lives: "saints",
  category_gospel_teachings: "gospel",
  category_daily_readings: "daily",
  category_bible_questions: "questions",
};
/** Materials of other topics live under this section. */
export const OTHER_SECTION = "post";
/** Earlier Armenian section addresses (/saghmosner/22, /aghotkner/71-…); they move to the new ones. */
export const OLD_SECTION_SLUGS: Record<string, string> = {
  saghmosner: "psalms",
  aghotkner: "pray",
  "srberi-varq": "saints",
  "avetarani-usutsum": "gospel",
  "orva-entertsumner": "daily",
  hartser: "questions",
  nyut: "post",
};
const SECTION_TO_CATEGORY = new Map(Object.entries(SECTION_SLUGS).map(([id, slug]) => [slug, id as ContentCategoryId]));

/** The current address of a section, also for an old one ("saghmosner" → "psalms"). */
export function currentSection(section: string) {
  return OLD_SECTION_SLUGS[section] ?? section;
}

export function categoryForSection(section: string) {
  return SECTION_TO_CATEGORY.get(currentSection(section)) ?? null;
}

export function isMaterialSection(section: string) {
  const current = currentSection(section);
  return SECTION_TO_CATEGORY.has(current) || current === OTHER_SECTION;
}

function sectionOf(category: string | null | undefined) {
  const id = resolveContentCategoryId(category, category);
  return id ? SECTION_SLUGS[id] : null;
}

/** A section's address: "/psalms"; other topics keep "/categories/<slug>". */
export function sectionPath(category: { id?: string | null; name?: string | null; slug: string }) {
  const id = resolveContentCategoryId(category.id, category.name);
  return id ? `/${SECTION_SLUGS[id]}` : `/categories/${category.slug}`;
}

/**
 * A material's address: a psalm by its number ("/psalms/22"), anything else by its post number
 * ("/pray/71"). `category` is a section id or name.
 */
export function materialPath(id: string, category?: string | null, details: { title?: string | null; psalm?: number | null } = {}) {
  const reference = parseMaterialId(id);
  if (!reference || reference.chatId !== LIBRARY_CHAT_ID) return `/materials/${id}`;
  const section = sectionOf(category) ?? OTHER_SECTION;
  if (section === SECTION_SLUGS.category_psalms) {
    // /psalms/<n> is the psalm's number, so a post without one goes under /post/<id>.
    return details.psalm ? `/${section}/${details.psalm}` : `/${OTHER_SECTION}/${reference.messageId}`;
  }
  return `/${section}/${reference.messageId}`;
}

/**
 * What an item segment names: a psalm number ("22") or a post ("71"; old addresses carried the
 * title after it, "71-pahpanutyan-aghotk").
 */
export function parseItemSegment(section: string, item: string): { psalm: number } | { materialId: string } | null {
  if (currentSection(section) === SECTION_SLUGS.category_psalms && /^\d{1,3}$/u.test(item)) return { psalm: Number(item) };
  const match = /^(\d{1,12})(?:-[a-z0-9-]*)?$/u.exec(item);
  return match ? { materialId: createMaterialId(LIBRARY_CHAT_ID, Number(match[1])) } : null;
}

const OLD_SHORT_PATH = /^(pray|psalm|saint|gospel|day|quiz|post)_(\d{1,12})$/u;

/** The material behind an old short address ("pray_364"); those redirect to the readable one. */
export function materialIdFromShortPath(segment: string) {
  const match = OLD_SHORT_PATH.exec(segment);
  return match ? createMaterialId(LIBRARY_CHAT_ID, Number(match[2])) : null;
}

/** Pages the edge may cache: sections, materials, verses and old addresses. */
export function isLibraryPath(pathname: string) {
  const [first = "", second, third, ...rest] = pathname.replace(/^\//u, "").split("/");
  if (OLD_SHORT_PATH.test(first)) return second === undefined;
  if (!isMaterialSection(first) || rest.length > 0) return false;
  if (second === undefined) return true;
  return /^[a-z0-9-]{1,80}$/u.test(second) && (third === undefined || /^\d{1,3}$/u.test(third));
}
