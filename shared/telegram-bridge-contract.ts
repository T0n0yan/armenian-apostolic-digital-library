export const CONTENT_CATEGORIES = [
  { id: "category_saints_lives", slug: "saints-lives", name: "Սրբերի կյանքը", defaultSort: "title-asc" },
  { id: "category_gospel_teachings", slug: "gospel-teachings", name: "Ավետարանի ուսուցում", defaultSort: "manual" },
  { id: "category_psalms", slug: "psalms", name: "Սաղմոսներ", defaultSort: "number-asc" },
  { id: "category_daily_readings", slug: "daily-readings", name: "Օրվա ընթերցումներ", defaultSort: "date-desc" },
  { id: "category_bible_questions", slug: "bible-questions", name: "Հարցեր Աստվածաշնչից", defaultSort: "title-asc" },
  { id: "category_prayers", slug: "prayers", name: "Աղոթքներ", defaultSort: "title-asc" },
] as const;

export type ContentCategoryId = (typeof CONTENT_CATEGORIES)[number]["id"];
export type ContentCategorySlug = (typeof CONTENT_CATEGORIES)[number]["slug"];
export type CategorySort = (typeof CONTENT_CATEGORIES)[number]["defaultSort"];

export type BridgeCategory = {
  id: string;
  slug: string;
  name: string;
  defaultSort: CategorySort;
  materialCount: number | null;
  messageCount: number | null;
  chatId: string | null;
  topicId: number | null;
  status: "open" | "closed" | "hidden";
  iconColor: number | null;
  iconEmojiId: string | null;
  isGeneral: boolean;
};

export type BridgeMediaKind = "photo" | "video" | "audio" | "voice" | "animation" | "document";

export type BridgeMedia = {
  index: number;
  kind: BridgeMediaKind;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  title: string | null;
  performer: string | null;
  waveform: string | null;
  hasThumbnail: boolean;
  altText: string;
};

export type BridgeTextEntity = {
  type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "code" | "pre" | "blockquote" | "expandable-blockquote" | "link" | "mention" | "hashtag" | "cashtag" | "bot-command" | "custom-emoji";
  offset: number;
  length: number;
  url: string | null;
  language?: string | null;
  customEmojiId?: string | null;
};

export type BridgeFormattedText = {
  text: string;
  entities: BridgeTextEntity[];
};

export type BridgeRichInline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "code" | "subscript" | "superscript" | "mark"; children: BridgeRichInline[] }
  | { type: "link"; url: string | null; children: BridgeRichInline[] }
  | { type: "custom-emoji"; alt: string; documentId: string | null }
  | { type: "line-break" }
  | { type: "unsupported"; telegramType: string };

export type BridgeRichBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: BridgeRichInline[] }
  | { type: "paragraph"; content: BridgeRichInline[] }
  | { type: "pre"; language: string | null; content: BridgeRichInline[] }
  | { type: "list"; ordered: boolean; start: number | null; items: BridgeRichBlock[][] }
  | { type: "blockquote"; expandable: boolean; blocks: BridgeRichBlock[]; caption: BridgeRichInline[] }
  | { type: "divider" }
  | { type: "media"; mediaIndex: number; caption: BridgeRichInline[] }
  | { type: "unsupported"; telegramType: string };

export type BridgeRichContent = {
  blocks: BridgeRichBlock[];
  partial: boolean;
};

export type BridgePoll = {
  question: BridgeFormattedText;
  options: Array<{
    text: BridgeFormattedText;
    voterCount: number;
  }>;
  totalVoters: number;
  closed: boolean;
  anonymous: boolean;
  multipleChoice: boolean;
  quiz: boolean;
};

export type BridgeLocation = {
  latitude: number;
  longitude: number;
  title: string | null;
  address: string | null;
  provider: string | null;
  venueId: string | null;
  venueType: string | null;
  live: boolean;
  livePeriodSeconds: number | null;
  heading: number | null;
  proximityNotificationRadius: number | null;
  expiresAt: string | null;
};

export type BridgeContentType =
  | "text"
  | "photo"
  | "album"
  | "video"
  | "voice"
  | "audio"
  | "poll"
  | "location"
  | "document"
  | "animation"
  | "unsupported";

export type BridgeSearchMatchReason =
  | "telegram-id"
  | "title"
  | "body"
  | "caption"
  | "poll-question"
  | "poll-option"
  | "location"
  | "audio"
  | "document"
  | "topic"
  | "hashtag"
  | "transliteration"
  | "fuzzy";

export type BridgeSearchScoreCategory =
  | "message-id"
  | "exact-primary"
  | "exact-token"
  | "prefix"
  | "content"
  | "transliteration"
  | "fuzzy";

export type BridgeSearchHitSource =
  | "title" | "content" | "caption" | "poll" | "location"
  | "audio" | "document" | "topic" | "hashtag" | "personal-note";

export type BridgeSearchHit = {
  source: BridgeSearchHitSource;
  blockId: string | null;
  /** UTF-16 offsets in the original source string, matching Telegram/DOM semantics. */
  start: number;
  length: number;
  snippet: string;
  snippetStart: number;
  snippetMatchStart: number;
  snippetMatchLength: number;
};

export function isBridgeSearchHit(value: unknown): value is BridgeSearchHit {
  if (!value || typeof value !== "object") return false;
  const hit = value as Partial<BridgeSearchHit>;
  const sources = new Set<BridgeSearchHitSource>(["title", "content", "caption", "poll", "location", "audio", "document", "topic", "hashtag", "personal-note"]);
  const validBlock = hit.blockId === null || (typeof hit.blockId === "string" && /^(?:block(?:-\d+)+(?:-caption)?|formatted-(?:text|caption)|poll-(?:question|option-\d+))$/u.test(hit.blockId));
  return typeof hit.source === "string" && sources.has(hit.source as BridgeSearchHitSource) && validBlock &&
    Number.isSafeInteger(hit.start) && Number(hit.start) >= 0 && Number(hit.start) <= 8_000 &&
    Number.isSafeInteger(hit.length) && Number(hit.length) > 0 && Number(hit.length) <= 400 &&
    typeof hit.snippet === "string" && hit.snippet.length <= 400 && Number.isSafeInteger(hit.snippetStart) && Number(hit.snippetStart) >= 0 &&
    Number.isSafeInteger(hit.snippetMatchStart) && Number(hit.snippetMatchStart) >= 0 &&
    Number.isSafeInteger(hit.snippetMatchLength) && Number(hit.snippetMatchLength) > 0 &&
    Number(hit.snippetMatchStart) + Number(hit.snippetMatchLength) <= hit.snippet.length;
}

export type BridgeSearchMatch = {
  scoreCategory: BridgeSearchScoreCategory;
  reasons: BridgeSearchMatchReason[];
  matchedMessageId?: number;
  hit?: BridgeSearchHit;
};

export type BridgePost = {
  id: string;
  chatId: string;
  messageId: number;
  constituentMessageIds: number[];
  topicId: number | null;
  forumTopicId: number | null;
  mediaGroupId: string | null;
  title: string;
  telegramUrl: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  contentText: string;
  captionText: string;
  formattedText: BridgeFormattedText;
  formattedCaption: BridgeFormattedText;
  richContent: BridgeRichContent | null;
  contentType: BridgeContentType;
  poll: BridgePoll | null;
  location: BridgeLocation | null;
  unsupportedType: string | null;
  tags: string[];
  publishedAt: string | null;
  editedAt: string | null;
  dateValue: string | null;
  numberValue: number | null;
  media: BridgeMedia[];
  deleted: boolean;
  /** Telegram user ID of the sender; the chat's own ID for anonymous admins; null if unknown. */
  authorId?: string | null;
  authorName?: string | null;
  searchMatch?: BridgeSearchMatch;
};

export type BridgePostPage = {
  posts: BridgePost[];
  nextCursor: string | null;
  total: number | null;
};

export type BridgeCategoryMappings = {
  topics: Record<string, ContentCategoryId>;
  hashtags: Record<string, ContentCategoryId>;
  posts: Record<string, ContentCategoryId>;
};

export type BridgeMediaDescriptor = BridgeMedia & {
  chatId: string;
  messageId: number;
};

export function telegramReferenceKey(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}

export function telegramTopicKey(chatId: string, topicId: number) {
  return `${chatId}:${topicId}`;
}

export function createMaterialId(chatId: string, messageId: number) {
  const chatPart = chatId.startsWith("-") ? `n${chatId.slice(1)}` : `p${chatId}`;
  return `material_tg_${chatPart}_${messageId}`;
}

function telegramChatSlugPart(chatId: string) {
  return chatId.startsWith("-") ? `n${chatId.slice(1)}` : `p${chatId}`;
}

export function createTopicCategoryId(chatId: string, topicId: number) {
  return `telegram_topic:${chatId}:${topicId}`;
}

export function createTopicSlug(chatId: string, topicId: number) {
  return `topic-${telegramChatSlugPart(chatId)}-${topicId}`;
}

export function parseTopicSlug(slug: string) {
  const match = /^topic-([np])(\d{1,20})-(\d{1,10})$/u.exec(slug);
  if (!match) return null;
  const topicId = Number(match[3]);
  if (!Number.isSafeInteger(topicId) || topicId <= 0) return null;
  return { chatId: `${match[1] === "n" ? "-" : ""}${match[2]}`, topicId };
}

export function parseMaterialId(id: string) {
  const match = /^material_tg_([np])(\d{1,20})_(\d{1,20})$/u.exec(id);
  if (!match) return null;
  const messageId = Number(match[3]);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return null;
  return { chatId: `${match[1] === "n" ? "-" : ""}${match[2]}`, messageId };
}

export function categoryById(id: string | null | undefined) {
  return CONTENT_CATEGORIES.find((category) => category.id === id) ?? null;
}

function normalizeCategoryName(value: string) {
  return value.normalize("NFC").trim().toLocaleLowerCase("hy");
}

/** Maps a dynamic Telegram topic to a known content category by ID, then by its display name. */
export function resolveContentCategoryId(id: string | null | undefined, name?: string | null): ContentCategoryId | null {
  const byId = categoryById(id);
  if (byId) return byId.id;
  if (!name) return null;
  const normalized = normalizeCategoryName(name);
  return CONTENT_CATEGORIES.find((category) => normalizeCategoryName(category.name) === normalized)?.id ?? null;
}

export function categoryBySlug(slug: string | null | undefined) {
  return CONTENT_CATEGORIES.find((category) => category.slug === slug) ?? null;
}
