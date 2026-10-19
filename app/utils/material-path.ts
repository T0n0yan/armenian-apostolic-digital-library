import { createMaterialId, parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** The library's Telegram group; its posts get short addresses such as /pray_364. */
export const LIBRARY_CHAT_ID = "-1002993860753";

const PREFIXES: Record<string, string> = {
  category_prayers: "pray",
  category_psalms: "psalm",
  category_saints_lives: "saint",
  category_gospel_teachings: "gospel",
  category_daily_readings: "day",
  category_bible_questions: "quiz",
};
const SHORT_PATH = /^(pray|psalm|saint|gospel|day|quiz|post)_(\d{1,12})$/u;

/**
 * A material's address: short and readable for the library's own posts ("/psalm_363",
 * "/pray_364"), the long id otherwise. `category` is a section id or name.
 */
export function materialPath(id: string, category?: string | null) {
  const reference = parseMaterialId(id);
  if (!reference || reference.chatId !== LIBRARY_CHAT_ID) return `/materials/${id}`;
  const prefix = PREFIXES[resolveContentCategoryId(category, category) ?? ""] ?? "post";
  return `/${prefix}_${reference.messageId}`;
}

/** The material id behind a short address ("pray_364"), or null when it isn't one. */
export function materialIdFromShortPath(segment: string) {
  const match = SHORT_PATH.exec(segment);
  return match ? createMaterialId(LIBRARY_CHAT_ID, Number(match[2])) : null;
}

export function isShortMaterialPath(pathname: string) {
  return SHORT_PATH.test(pathname.replace(/^\//u, ""));
}
