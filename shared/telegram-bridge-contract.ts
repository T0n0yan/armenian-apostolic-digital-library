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
  id: ContentCategoryId;
  slug: ContentCategorySlug;
  name: string;
  defaultSort: CategorySort;
  materialCount: number;
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
  altText: string;
};

export type BridgePost = {
  id: string;
  chatId: string;
  messageId: number;
  forumTopicId: number | null;
  title: string;
  telegramUrl: string;
  categoryId: ContentCategoryId | null;
  categoryName: string | null;
  categorySlug: ContentCategorySlug | null;
  contentText: string;
  captionText: string;
  tags: string[];
  publishedAt: string | null;
  editedAt: string | null;
  dateValue: string | null;
  numberValue: number | null;
  media: BridgeMedia[];
  deleted: boolean;
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

export function categoryBySlug(slug: string | null | undefined) {
  return CONTENT_CATEGORIES.find((category) => category.slug === slug) ?? null;
}
