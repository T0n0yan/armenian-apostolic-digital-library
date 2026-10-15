import { createMaterialId } from "../../../shared/telegram-bridge-contract";
import type {
  AdapterPage,
  HistoryOptions,
  MediaDescriptor,
  MediaRequest,
  TelegramAdapter,
  TelegramPost,
} from "./adapter";

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
    mimeType: kind === "photo" ? "image/jpeg" : kind === "video" ? "video/mp4" : "application/octet-stream",
    fileName: kind === "photo" ? `fixture-${index + 1}.jpg` : kind === "video" ? "fixture-video.mp4" : null,
    sizeBytes: kind === "video" ? VIDEO_SIZE : 8_192,
    width: kind === "photo" || kind === "video" ? 1280 : null,
    height: kind === "photo" || kind === "video" ? 720 : null,
    duration: kind === "video" ? 7_200 : null,
    altText: kind === "photo" ? "Փորձնական Telegram նկար" : "Փորձնական Telegram տեսանյութ",
    ...overrides,
  };
}

function post(input: Partial<TelegramPost> & Pick<TelegramPost, "messageId" | "title" | "contentText">): TelegramPost {
  return {
    id: createMaterialId(CHAT_ID, input.messageId),
    chatId: CHAT_ID,
    forumTopicId: 700,
    telegramUrl: `https://t.me/fixture_channel/${input.messageId}`,
    captionText: "",
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
  post({ messageId: 106, title: "Մեծ տեսանյութ", contentText: "120 MB-ից մեծ հոգևոր տեսանյութ։", tags: ["աղոթք"], media: [media(0, "video")] }),
  post({ messageId: 105, title: "Ջնջված հրապարակում", contentText: "", deleted: true }),
  post({ messageId: 104, title: "Խմբագրված խաղաղության խոսք", contentText: "Խմբագրված հայկական տեքստ և խաղաղության պատգամ։", editedAt: "2026-10-15T10:30:00.000Z" }),
  post({ messageId: 103, title: "Պատկերաշար", contentText: "Երկու նկարով Telegram album։", media: [media(0, "photo"), media(1, "photo")] }),
  post({ messageId: 102, title: "Սուրբ պատկերի պատմություն", contentText: "Նկարով հրապարակման ամբողջ տեքստը։", media: [media(0, "photo")] }),
  post({ messageId: 101, title: "Առավոտյան աղոթք", contentText: "Տե՛ր, խաղաղություն պարգևիր մեր ժողովրդին։", tags: ["աղոթք"] }),
];

function readCursor(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    return Number.isSafeInteger(parsed.offset) && Number(parsed.offset) >= 0 ? Number(parsed.offset) : 0;
  } catch {
    return 0;
  }
}

function nextCursor(offset: number, total: number) {
  return offset < total ? Buffer.from(JSON.stringify({ offset })).toString("base64url") : null;
}

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("hy-AM").replace(/եւ/gu, "և").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export class MockTelegramAdapter implements TelegramAdapter {
  readonly stats = { abortedStreams: 0, completedStreams: 0 };

  async connect() {}
  async close() {}

  async listHistory({ cursor, limit, signal }: HistoryOptions): Promise<AdapterPage> {
    signal.throwIfAborted();
    const available = MOCK_TELEGRAM_POSTS.filter((item) => !item.deleted);
    const offset = readCursor(cursor);
    const posts = available.slice(offset, offset + limit);
    return { posts, nextCursor: nextCursor(offset + posts.length, available.length) };
  }

  async search({ cursor, limit, query = "", signal }: HistoryOptions): Promise<AdapterPage> {
    signal.throwIfAborted();
    const needle = normalize(query);
    const available = MOCK_TELEGRAM_POSTS.filter((item) =>
      !item.deleted && normalize(`${item.title} ${item.contentText} ${item.captionText} ${item.tags.join(" ")}`).includes(needle),
    );
    const offset = readCursor(cursor);
    const posts = available.slice(offset, offset + limit);
    return { posts, nextCursor: nextCursor(offset + posts.length, available.length) };
  }

  async getPost(chatId: string, messageId: number, signal: AbortSignal) {
    signal.throwIfAborted();
    return MOCK_TELEGRAM_POSTS.find((item) => item.chatId === chatId && item.messageId === messageId) ?? null;
  }

  async getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal) {
    const post = await this.getPost(chatId, messageId, signal);
    const asset = post?.media[mediaIndex];
    return asset ? { ...asset, chatId, messageId } : null;
  }

  async *streamMedia({ chatId, messageId, mediaIndex, start, end, signal }: MediaRequest) {
    const descriptor = await this.getMediaDescriptor(chatId, messageId, mediaIndex, signal);
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
