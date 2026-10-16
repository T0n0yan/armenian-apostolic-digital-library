import { createMaterialId, createTopicCategoryId, createTopicSlug, type BridgeCategory } from "../../../shared/telegram-bridge-contract";
import type {
  AdapterPage,
  HistoryOptions,
  MediaDescriptor,
  MediaRequest,
  TelegramAdapter,
  TelegramPost,
} from "./adapter";
import { InvalidPaginationCursorError } from "./adapter";

const CHAT_ID = "-100900";
const VIDEO_SIZE = 120 * 1024 * 1024 + 17;

function media(
  index: number,
  kind: MediaDescriptor["kind"],
  overrides: Partial<MediaDescriptor> = {},
): Omit<MediaDescriptor, "chatId" | "messageId"> {
  return {
    index,
    kind,
    mimeType: kind === "photo" ? "image/jpeg" : kind === "video" ? "video/mp4" : kind === "voice" ? "audio/ogg" : kind === "audio" ? "audio/mpeg" : "application/octet-stream",
    fileName: kind === "photo" ? `fixture-${index + 1}.jpg` : kind === "video" ? "fixture-video.mp4" : kind === "audio" ? "fixture-audio.mp3" : null,
    sizeBytes: kind === "video" ? VIDEO_SIZE : 8_192,
    width: kind === "photo" || kind === "video" ? 1280 : null,
    height: kind === "photo" || kind === "video" ? 720 : null,
    duration: kind === "video" ? 7_200 : kind === "voice" || kind === "audio" ? 49 : null,
    title: null,
    performer: null,
    waveform: kind === "voice" ? "AQIDBA" : null,
    hasThumbnail: kind === "photo" || kind === "video" || kind === "audio",
    altText: kind === "photo" ? "Փորձնական Telegram նկար" : "Փորձնական Telegram տեսանյութ",
    ...overrides,
  };
}

function post(input: Partial<TelegramPost> & Pick<TelegramPost, "messageId" | "title" | "contentText">): TelegramPost {
  return {
    id: createMaterialId(CHAT_ID, input.messageId),
    chatId: CHAT_ID,
    constituentMessageIds: [input.messageId],
    topicId: 700,
    forumTopicId: 700,
    mediaGroupId: null,
    telegramUrl: `https://t.me/fixture_channel/${input.messageId}`,
    captionText: "",
    formattedText: { text: input.contentText, entities: [] },
    formattedCaption: { text: "", entities: [] },
    richContent: null,
    contentType: "text",
    poll: null,
    location: null,
    unsupportedType: null,
    tags: [],
    publishedAt: new Date(Date.UTC(2026, 9, 15, 8, input.messageId % 60)).toISOString(),
    editedAt: null,
    dateValue: "2026-10-15",
    numberValue: null,
    media: [],
    deleted: false,
    ...input,
  };
}

export const MOCK_TELEGRAM_POSTS: TelegramPost[] = [
  post({ messageId: 113, title: "Փորձնական փաստաթուղթ", contentText: "Փաստաթղթի նկարագրություն", contentType: "document", media: [media(0, "document", { fileName: "fixture-document.pdf", mimeType: "application/pdf" })] }),
  post({
    messageId: 112,
    title: "Ձևաչափված ընթերցում",
    contentText: "Ձևաչափված ընթերցում Թավ տեքստ մեջբերում",
    contentType: "photo",
    media: [media(0, "photo")],
    richContent: {
      partial: false,
      blocks: [
        { type: "heading", level: 1, content: [{ type: "text", text: "Ձևաչափված ընթերցում" }] },
        { type: "paragraph", content: [{ type: "bold", children: [{ type: "text", text: "Թավ տեքստ" }] }, { type: "line-break" }, { type: "link", url: null, children: [{ type: "text", text: "անվտանգ fallback" }] }] },
        { type: "media", mediaIndex: 0, caption: [{ type: "italic", children: [{ type: "text", text: "Նկարի բացատրություն" }] }] },
        { type: "blockquote", expandable: false, blocks: [{ type: "paragraph", content: [{ type: "text", text: "մեջբերում" }] }], caption: [] },
      ],
    },
  }),
  post({ messageId: 110, title: "Չաջակցվող նյութ", contentText: "", contentType: "unsupported", unsupportedType: "unknown-attachment" }),
  post({
    messageId: 109,
    title: "Ո՞ր կլոր տարբերակն ես ընտրում",
    contentText: "",
    contentType: "poll",
    poll: {
      question: { text: "Ո՞ր կլոր տարբերակն ես ընտրում", entities: [] },
      options: [
        { text: { text: "Սաղմոս 12", entities: [] }, voterCount: 3 },
        { text: { text: "Սաղմոս 50", entities: [] }, voterCount: 5 },
      ],
      totalVoters: 8,
      closed: false,
      anonymous: true,
      multipleChoice: false,
      quiz: false,
    },
  }),
  post({
    messageId: 108,
    title: "Bacat Caffe",
    contentText: "",
    contentType: "location",
    location: {
      latitude: 40.1619,
      longitude: 44.2911,
      title: "Bacat Caffe",
      address: "Երևան",
      provider: "fixture",
      venueId: "fixture-venue",
      venueType: "church",
      live: false,
      livePeriodSeconds: null,
      heading: null,
      proximityNotificationRadius: null,
      expiresAt: null,
    },
  }),
  post({ messageId: 107, title: "Սաղմոս 12", contentText: "", contentType: "audio", media: [media(0, "audio", { title: "Սաղմոս 12", performer: "Փորձնական կատարող" })] }),
  post({ messageId: 106, title: "Մեծ տեսանյութ", contentText: "120 MB-ից մեծ հոգևոր տեսանյութ։", contentType: "video", tags: ["աղոթք"], media: [media(0, "video")] }),
  post({ messageId: 105, title: "Ջնջված հրապարակում", contentText: "", deleted: true }),
  post({ messageId: 104, title: "Խմբագրված խաղաղության խոսք", contentText: "Խմբագրված հայկական տեքստ և խաղաղության պատգամ։", editedAt: "2026-10-15T10:30:00.000Z" }),
  post({ messageId: 103, constituentMessageIds: [103, 111], title: "Պատկերաշար", contentText: "Երկու նկարով Telegram album։", contentType: "album", mediaGroupId: "fixture-album", media: [media(0, "photo"), media(1, "photo")] }),
  post({ messageId: 102, title: "Սուրբ պատկերի պատմություն", contentText: "Նկարագրություն՝ հրապարակման ամբողջ տեքստը։", captionText: "Նկարագրություն՝ հրապարակման ամբողջ տեքստը։", formattedCaption: { text: "Նկարագրություն՝ հրապարակման ամբողջ տեքստը։", entities: [] }, contentType: "photo", media: [media(0, "photo")] }),
  post({ messageId: 67, title: "Telegram նյութ #67", contentText: "Փորձնական ID որոնման նյութ։" }),
  post({ messageId: 101, title: "Առավոտյան աղոթք", contentText: "Տե՛ր, խաղաղություն պարգևիր մեր ժողովրդին։", formattedText: { text: "Տե՛ր, խաղաղություն պարգևիր մեր ժողովրդին։", entities: [{ type: "bold", offset: 0, length: 4, url: null }] }, tags: ["աղոթք"] }),
  ...Array.from({ length: 5 }, (_, index) => post({
    messageId: 100 - index,
    title: `Լրացուցիչ նյութ ${index + 1}`,
    contentText: `Cursor pagination fixture ${index + 1}`,
  })),
];

function cursorScope(options: Pick<HistoryOptions, "chatId" | "topicId" | "query">) {
  return JSON.stringify({ chatId: options.chatId ?? null, topicId: options.topicId ?? null, query: normalize(options.query ?? "") });
}

function readCursor(cursor: string | null, options: Pick<HistoryOptions, "chatId" | "topicId" | "query">, available: TelegramPost[]) {
  if (!cursor) return 0;
  if (cursor.length > 2_000) throw new InvalidPaginationCursorError();
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { version?: unknown; scope?: unknown; materialId?: unknown };
    if (parsed.version !== 1 || parsed.scope !== cursorScope(options) || typeof parsed.materialId !== "string") {
      throw new InvalidPaginationCursorError();
    }
    const index = available.findIndex((post) => post.id === parsed.materialId);
    if (index < 0) throw new InvalidPaginationCursorError();
    return index + 1;
  } catch (error) {
    if (error instanceof InvalidPaginationCursorError) throw error;
    throw new InvalidPaginationCursorError();
  }
}

function nextCursor(posts: TelegramPost[], end: number, total: number, options: Pick<HistoryOptions, "chatId" | "topicId" | "query">) {
  const last = posts.at(-1);
  return last && end < total
    ? Buffer.from(JSON.stringify({ version: 1, scope: cursorScope(options), materialId: last.id })).toString("base64url")
    : null;
}

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("hy-AM").replace(/եւ/gu, "և").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export class MockTelegramAdapter implements TelegramAdapter {
  readonly stats = { abortedStreams: 0, completedStreams: 0 };

  async connect() {}
  async close() {}

  async listTopics(): Promise<BridgeCategory[]> {
    const namedTopics = [
      [700, "Աղոթքներ"],
      [701, "Սրբերի կյանք"],
      [702, "Ավետարանի ուսուցում"],
      [703, "Սաղմոսներ"],
      [704, "Հարցեր Աստվածաշնչից"],
      [705, "Օրվա ընթերցանություն"],
    ] as const;
    return [
      {
        id: createTopicCategoryId(CHAT_ID, 1),
        slug: createTopicSlug(CHAT_ID, 1),
        name: "General",
        defaultSort: "date-desc",
        materialCount: 0,
        messageCount: 0,
        chatId: CHAT_ID,
        topicId: 1,
        status: "open",
        iconColor: 0x6f7780,
        iconEmojiId: null,
        isGeneral: true,
      },
      ...namedTopics.map(([topicId, name]) => ({
        id: createTopicCategoryId(CHAT_ID, topicId),
        slug: createTopicSlug(CHAT_ID, topicId),
        name,
        defaultSort: "date-desc" as const,
        materialCount: topicId === 700 ? MOCK_TELEGRAM_POSTS.filter((item) => !item.deleted).length : 0,
        messageCount: topicId === 700 ? MOCK_TELEGRAM_POSTS.length : 0,
        chatId: CHAT_ID,
        topicId,
        status: "open" as const,
        iconColor: 0x6fb9f0,
        iconEmojiId: null,
        isGeneral: false,
      })),
    ];
  }

  async listHistory(options: HistoryOptions): Promise<AdapterPage> {
    const { cursor, limit, chatId, topicId, signal } = options;
    signal.throwIfAborted();
    const available = MOCK_TELEGRAM_POSTS.filter((item) =>
      !item.deleted &&
      (!chatId || item.chatId === chatId) &&
      (!topicId || (item.topicId ?? item.forumTopicId ?? 1) === topicId),
    );
    const offset = readCursor(cursor, options, available);
    const posts = available.slice(offset, offset + limit);
    return { posts, nextCursor: nextCursor(posts, offset + posts.length, available.length, options) };
  }

  async search(options: HistoryOptions): Promise<AdapterPage> {
    const { cursor, limit, query = "", chatId, topicId, signal } = options;
    signal.throwIfAborted();
    const needle = normalize(query);
    const available = MOCK_TELEGRAM_POSTS.filter((item) =>
      !item.deleted &&
      (!chatId || item.chatId === chatId) &&
      (!topicId || (item.topicId ?? item.forumTopicId ?? 1) === topicId) &&
      normalize(`${item.title} ${item.contentText} ${item.captionText} ${item.tags.join(" ")}`).includes(needle),
    );
    const offset = readCursor(cursor, options, available);
    const posts = available.slice(offset, offset + limit);
    return { posts, nextCursor: nextCursor(posts, offset + posts.length, available.length, options) };
  }

  async getPost(chatId: string, messageId: number, signal: AbortSignal) {
    signal.throwIfAborted();
    return MOCK_TELEGRAM_POSTS.find((item) => item.chatId === chatId && item.constituentMessageIds.includes(messageId)) ?? null;
  }

  async getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal, thumbnail = false) {
    const post = await this.getPost(chatId, messageId, signal);
    const asset = post?.media[mediaIndex];
    if (!asset || (thumbnail && !asset.hasThumbnail)) return null;
    return asset ? {
      ...asset,
      ...(thumbnail ? { mimeType: "image/jpeg", sizeBytes: 4_096, width: 320, height: 180, duration: null, hasThumbnail: false } : {}),
      chatId,
      messageId,
      thumbnail,
    } : null;
  }

  async *streamMedia({ chatId, messageId, mediaIndex, start, end, thumbnail, signal }: MediaRequest) {
    const descriptor = await this.getMediaDescriptor(chatId, messageId, mediaIndex, signal, thumbnail);
    if (!descriptor) return;
    let offset = start;
    try {
      while (offset <= end) {
        if (signal.aborted) throw signal.reason;
        const length = Math.min(64 * 1024, end - offset + 1);
        const chunk = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) chunk[index] = (offset + index) % 251;
        offset += length;
        await new Promise((resolve) => setTimeout(resolve, 0));
        yield chunk;
      }
    } finally {
      if (signal.aborted) this.stats.abortedStreams += 1;
      else if (offset > end) this.stats.completedStreams += 1;
    }
  }
}

export { CHAT_ID as MOCK_CHAT_ID, VIDEO_SIZE as MOCK_VIDEO_SIZE };
