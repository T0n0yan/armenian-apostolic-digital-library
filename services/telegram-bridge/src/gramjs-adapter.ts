import bigInt from "big-integer";
import { Api, DeletedMessage, EditedMessage, Logger, LogLevel, NewMessage, Rich, StringSession, TelegramClient, utils, type DeletedMessageEvent, type Entity, type NewMessageEvent } from "./telegram-client";

import {
  createMaterialId,
  createTopicCategoryId,
  createTopicSlug,
  type BridgeCategory,
  type BridgeFormattedText,
  type BridgeLocation,
  type BridgePoll,
  type BridgeTextEntity,
} from "../../../shared/telegram-bridge-contract";
import type {
  AdapterPage,
  ContentChange,
  HistoryOptions,
  MediaDescriptor,
  MediaRequest,
  TelegramAdapter,
  TelegramAdmin,
  TelegramPost,
  TopicOptions,
} from "./adapter";
import { InvalidPaginationCursorError } from "./adapter";
import { mapRichMessage, type RichMediaSource } from "./rich-message";
import { SharedOperationRegistry } from "../../../shared/async-lifecycle";

type GramConfig = {
  apiId: number;
  apiHash: string;
  session: string;
  allowedChatIds: string[];
};

type Cursor = { version: 1; scope: string; offsets: Record<string, number> };

function cursorScope(options: HistoryOptions) {
  return JSON.stringify({ chatId: options.chatId ?? null, topicId: options.topicId ?? null, query: normalizeSearch(options.query ?? "") });
}

function cursorValue(value: string | null, options: HistoryOptions): Cursor {
  const scope = cursorScope(options);
  if (!value) return { version: 1, scope, offsets: {} };
  if (value.length > 2_000) throw new InvalidPaginationCursorError();
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (parsed.version !== 1 || parsed.scope !== scope || !parsed.offsets || typeof parsed.offsets !== "object") {
      throw new InvalidPaginationCursorError();
    }
    for (const [key, offset] of Object.entries(parsed.offsets)) {
      if (!key || !Number.isSafeInteger(offset) || offset <= 0) throw new InvalidPaginationCursorError();
    }
    return parsed as Cursor;
  } catch (error) {
    if (error instanceof InvalidPaginationCursorError) throw error;
    throw new InvalidPaginationCursorError();
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function isoDate(value: number | undefined) {
  return value ? new Date(value * 1_000).toISOString() : null;
}

function fileSize(value: number | bigInt.BigInteger | undefined) {
  if (typeof value === "number") return value;
  return value ? Number(value.toString()) : null;
}

function cleanText(value: string) {
  return value.normalize("NFC").trim();
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[՚-՟։֍֎.,!?;:()[\]{}"'«»—–-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("hy-AM")
    .replace(/եւ/gu, "և")
    .trim();
}

function searchableMessageText(message: Api.Message) {
  const pollQuestion = message.media instanceof Api.MessageMediaPoll
    ? message.media.poll.question.text
    : "";
  const richText = message.richMessage instanceof Api.RichMessage ? Rich.toPlainText(message.richMessage) : "";
  return normalizeSearch(`${message.message ?? ""} ${richText} ${pollQuestion}`);
}

function safeLink(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/iu.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mapFormattedText(text: string, entities: Api.TypeMessageEntity[] | undefined): BridgeFormattedText {
  // Telegram entity offsets are UTF-16 code-unit offsets into the original
  // string. Preserve that exact string here; normalization or trimming would
  // shift offsets for combining characters and leading whitespace.
  const normalized = text;
  const output: BridgeTextEntity[] = [];
  for (const entity of entities ?? []) {
    const offset = Number(entity.offset);
    const length = Number(entity.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset + length > normalized.length) continue;
    let type: BridgeTextEntity["type"] | null = null;
    let url: string | null = null;
    if (entity instanceof Api.MessageEntityBold) type = "bold";
    else if (entity instanceof Api.MessageEntityItalic) type = "italic";
    else if (entity instanceof Api.MessageEntityUnderline) type = "underline";
    else if (entity instanceof Api.MessageEntityStrike) type = "strikethrough";
    else if (entity instanceof Api.MessageEntityCode) type = "code";
    else if (entity instanceof Api.MessageEntitySpoiler) type = "spoiler";
    else if (entity instanceof Api.MessageEntityPre) type = "pre";
    else if (entity instanceof Api.MessageEntityBlockquote) type = entity.collapsed ? "expandable-blockquote" : "blockquote";
    else if (entity instanceof Api.MessageEntityTextUrl) { type = "link"; url = safeLink(entity.url); }
    else if (entity instanceof Api.MessageEntityUrl) { type = "link"; url = safeLink(normalized.slice(offset, offset + length)); }
    else if (entity instanceof Api.MessageEntityEmail) { type = "link"; url = safeLink(`mailto:${normalized.slice(offset, offset + length)}`); }
    else if (entity instanceof Api.MessageEntityPhone) { type = "link"; url = safeLink(`tel:${normalized.slice(offset, offset + length)}`); }
    else if (entity instanceof Api.MessageEntityMention) { type = "link"; url = safeLink(`https://t.me/${normalized.slice(offset + 1, offset + length)}`); }
    else if (entity instanceof Api.MessageEntityMentionName || entity instanceof Api.InputMessageEntityMentionName) type = "mention";
    else if (entity instanceof Api.MessageEntityHashtag) type = "hashtag";
    else if (entity instanceof Api.MessageEntityCashtag) type = "cashtag";
    else if (entity instanceof Api.MessageEntityBotCommand) type = "bot-command";
    else if (entity instanceof Api.MessageEntityCustomEmoji) type = "custom-emoji";
    if (type && (type !== "link" || url)) output.push({
      type,
      offset,
      length,
      url,
      ...(entity instanceof Api.MessageEntityPre ? { language: entity.language || null } : {}),
      ...(entity instanceof Api.MessageEntityCustomEmoji ? { customEmojiId: entity.documentId.toString() } : {}),
    });
  }
  return { text: normalized, entities: output };
}

type MediaSource = Api.Message | RichMediaSource;

function sourcePhoto(source: MediaSource) {
  return source instanceof Api.Photo ? source : source instanceof Api.Message && source.photo instanceof Api.Photo ? source.photo : null;
}

function sourceDocument(source: MediaSource) {
  return source instanceof Api.Document ? source : source instanceof Api.Message && source.document instanceof Api.Document ? source.document : null;
}

function audioAttribute(source: MediaSource) {
  const document = sourceDocument(source);
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeAudio => attribute instanceof Api.DocumentAttributeAudio) ?? null;
}

function videoAttribute(source: MediaSource) {
  const document = sourceDocument(source);
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeVideo => attribute instanceof Api.DocumentAttributeVideo) ?? null;
}

function fileNameAttribute(source: MediaSource) {
  const document = sourceDocument(source);
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeFilename => attribute instanceof Api.DocumentAttributeFilename) ?? null;
}

function photoMetadata(source: MediaSource) {
  const photo = sourcePhoto(source);
  if (!(photo instanceof Api.Photo)) return null;
  const sizes = photo.sizes.flatMap((size) => {
    if (size instanceof Api.PhotoSize) return [{ width: size.w, height: size.h, size: size.size }];
    if (size instanceof Api.PhotoSizeProgressive) return [{ width: size.w, height: size.h, size: Math.max(...size.sizes) }];
    return [];
  });
  return sizes.sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? null;
}

function hasThumbnail(source: MediaSource) {
  const photo = sourcePhoto(source);
  if (photo instanceof Api.Photo && photo.sizes.some((thumb) =>
    thumb instanceof Api.PhotoSize || thumb instanceof Api.PhotoSizeProgressive,
  )) return true;
  const document = sourceDocument(source);
  return document instanceof Api.Document && (document.thumbs ?? []).some((thumb) =>
    thumb instanceof Api.PhotoSize || thumb instanceof Api.PhotoSizeProgressive,
  );
}

function kindFor(source: MediaSource): MediaDescriptor["kind"] | null {
  if (sourcePhoto(source)) return "photo";
  const audio = audioAttribute(source);
  if (audio?.voice) return "voice";
  if (audio) return "audio";
  const video = videoAttribute(source);
  if (video) return "video";
  const document = sourceDocument(source);
  if (document) {
    if (document.mimeType === "image/gif") return "animation";
    return "document";
  }
  return null;
}

function mediaFor(source: MediaSource, index: number, title: string) {
  const kind = kindFor(source);
  if (!kind) return null;
  const audio = audioAttribute(source);
  const video = videoAttribute(source);
  const document = sourceDocument(source);
  const photo = photoMetadata(source);
  return {
    index,
    kind,
    mimeType: document?.mimeType ?? (photo ? "image/jpeg" : null),
    fileName: fileNameAttribute(source)?.fileName ?? null,
    sizeBytes: fileSize(document?.size) ?? photo?.size ?? null,
    width: video?.w ?? photo?.width ?? null,
    height: video?.h ?? photo?.height ?? null,
    duration: video?.duration ?? audio?.duration ?? null,
    title: audio?.title ?? null,
    performer: audio?.performer?.trim() || null,
    waveform: audio?.waveform ? Buffer.from(audio.waveform).toString("base64url") : null,
    hasThumbnail: hasThumbnail(source),
    altText: title,
  } satisfies TelegramPost["media"][number];
}

function topicId(message: Api.Message) {
  if (!message.replyTo?.forumTopic) return null;
  return message.replyTo.replyToTopId ?? message.replyTo.replyToMsgId ?? null;
}

function groupedId(message: Api.Message) {
  return message.groupedId?.toString() ?? null;
}

/** Sender of a post: the user, or the chat itself for anonymous admins and channel posts. */
export function messageAuthor(chatId: string, message: Api.Message): { authorId: string; authorName: string | null } {
  const from = message.fromId;
  const authorId = from instanceof Api.PeerUser ? from.userId.toString()
    : from instanceof Api.PeerChannel ? `-100${from.channelId.toString()}`
      : chatId;
  const sender = (message as unknown as { sender?: unknown }).sender;
  const senderName = sender instanceof Api.User
    ? [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim()
    : sender instanceof Api.Channel || sender instanceof Api.Chat ? sender.title : "";
  const visible = (value: string | null | undefined) => value?.replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/gu, "").trim() || null;
  const username = sender instanceof Api.User && sender.username ? `@${sender.username}` : null;
  return { authorId, authorName: visible(message.postAuthor) ?? visible(senderName) ?? username };
}

function isMessage(value: Api.Message | undefined): value is Api.Message {
  return value instanceof Api.Message;
}

type PollShape = {
  question: { text: string; entities?: Api.TypeMessageEntity[] };
  answers: Array<{ text: { text: string; entities?: Api.TypeMessageEntity[] }; option: Buffer }>;
  closed?: boolean;
  publicVoters?: boolean;
  multipleChoice?: boolean;
  quiz?: boolean;
};
type PollResultsShape = {
  results?: Array<{ option: Buffer; voters?: number; chosen?: boolean; correct?: boolean }>;
  totalVoters?: number;
  solution?: string;
  solutionEntities?: Api.TypeMessageEntity[];
};

function pollDto(poll: PollShape, results: PollResultsShape): BridgePoll {
  const resultByOption = new Map((results.results ?? []).map((result) => [Buffer.from(result.option).toString("base64url"), result]));
  return {
    question: mapFormattedText(poll.question.text, poll.question.entities),
    options: poll.answers.map((answer) => {
      const result = resultByOption.get(Buffer.from(answer.option).toString("base64url"));
      return {
        text: mapFormattedText(answer.text.text, answer.text.entities),
        voterCount: result?.voters ?? 0,
        ...(result?.correct ? { correct: true } : {}),
      };
    }),
    totalVoters: results.totalVoters ?? 0,
    closed: Boolean(poll.closed),
    anonymous: !poll.publicVoters,
    multipleChoice: Boolean(poll.multipleChoice),
    quiz: Boolean(poll.quiz),
    ...(results.solution ? { solution: results.solution } : {}),
  };
}

function pollFor(message: Api.Message): BridgePoll | null {
  if (!(message.media instanceof Api.MessageMediaPoll)) return null;
  const answers = message.media.poll.answers.filter((answer): answer is Api.PollAnswer => answer instanceof Api.PollAnswer);
  return pollDto({ ...message.media.poll, answers }, message.media.results);
}

function locationFor(message: Api.Message): BridgeLocation | null {
  const media = message.media;
  const venue = media instanceof Api.MessageMediaVenue ? media : null;
  const live = media instanceof Api.MessageMediaGeoLive ? media : null;
  const point = venue?.geo ?? (media instanceof Api.MessageMediaGeo ? media.geo : live?.geo);
  if (!(point instanceof Api.GeoPoint)) return null;
  return {
    latitude: point.lat,
    longitude: point.long,
    title: venue?.title ?? null,
    address: venue?.address ?? null,
    provider: venue?.provider ?? null,
    venueId: venue?.venueId ?? null,
    venueType: venue?.venueType ?? null,
    live: Boolean(live),
    livePeriodSeconds: live?.period ?? null,
    heading: live?.heading ?? null,
    proximityNotificationRadius: live?.proximityNotificationRadius ?? null,
    expiresAt: live && message.date ? isoDate(message.date + live.period) : null,
  };
}

function contentTypeFor(post: Pick<TelegramPost, "media" | "poll" | "location" | "contentText" | "unsupportedType">) {
  if (post.poll) return "poll" as const;
  if (post.location) return "location" as const;
  if (post.media.length > 1) return "album" as const;
  if (post.media[0]) return post.media[0].kind;
  if (post.unsupportedType) return "unsupported" as const;
  return "text" as const;
}

function topicStatus(topic: Api.ForumTopic): BridgeCategory["status"] {
  return topic.hidden ? "hidden" : topic.closed ? "closed" : "open";
}

function topicMessageCount(total: number | undefined) {
  return typeof total === "number" ? Math.max(0, total - 1) : null;
}

type TelegramThumbnail = { thumb: Api.TypePhotoSize; size: number; width: number | null; height: number | null };

function thumbnailFor(source: MediaSource): TelegramThumbnail | null {
  const candidates: TelegramThumbnail[] = [];
  const photo = sourcePhoto(source);
  const document = sourceDocument(source);
  const thumbs = photo instanceof Api.Photo
    ? photo.sizes
    : document instanceof Api.Document
      ? document.thumbs ?? []
      : [];
  for (const thumb of thumbs) {
    if (thumb instanceof Api.PhotoSize) candidates.push({ thumb, size: thumb.size, width: thumb.w, height: thumb.h });
    else if (thumb instanceof Api.PhotoSizeProgressive) candidates.push({ thumb, size: Math.max(...thumb.sizes), width: thumb.w, height: thumb.h });
  }
  const useful = candidates.filter((candidate) =>
    Math.max(candidate.width ?? 0, candidate.height ?? 0) <= 640,
  );
  return (useful.length ? useful : candidates)
    .sort((left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0))[0] ?? null;
}

function inputLocation(source: MediaSource, thumbnail = false) {
  const photo = sourcePhoto(source);
  const document = sourceDocument(source);
  const selected = thumbnail ? thumbnailFor(source)?.thumb : null;
  const thumbSize = selected && "type" in selected ? selected.type : "";
  if (photo) {
    const largest = photo.sizes.flatMap((size) => "type" in size ? [size.type] : []).at(-1) ?? "";
    return {
      location: new Api.InputPhotoFileLocation({
        id: photo.id,
        accessHash: photo.accessHash,
        fileReference: photo.fileReference,
        thumbSize: thumbnail ? thumbSize : largest,
      }),
      dcId: photo.dcId,
    };
  }
  if (document) return {
    location: new Api.InputDocumentFileLocation({
      id: document.id,
      accessHash: document.accessHash,
      fileReference: document.fileReference,
      thumbSize: thumbnail ? thumbSize : "",
    }),
    dcId: document.dcId,
  };
  return null;
}

const TELEGRAM_DOWNLOAD_CHUNK_SIZE = 512 * 1024;
const UNKNOWN_MEDIA_SIZE_PROBE_LIMIT = 64 * 1024 * 1024;

export function teleprotoDownloadParameters(start: number, end: number, dcId?: number) {
  const alignedOffset = Math.floor(start / TELEGRAM_DOWNLOAD_CHUNK_SIZE) * TELEGRAM_DOWNLOAD_CHUNK_SIZE;
  return {
    offset: bigInt(alignedOffset),
    requestSize: TELEGRAM_DOWNLOAD_CHUNK_SIZE,
    // Teleproto's iterator limit is bytes, not the archived GramJS chunk count.
    limit: end - alignedOffset + 1,
    leadingBytesToSkip: start - alignedOffset,
    ...(dcId ? { dcId } : {}),
  };
}

export async function probeUnknownMediaSize(
  readChunk: (offset: number) => Promise<number>,
  chunkSize = TELEGRAM_DOWNLOAD_CHUNK_SIZE,
  maximumSize = UNKNOWN_MEDIA_SIZE_PROBE_LIMIT,
) {
  const maximumChunk = Math.ceil(maximumSize / chunkSize);
  const first = await readChunk(0);
  if (first < chunkSize) return first;

  let lowerFullChunk = 0;
  let upperTerminalChunk = 1;
  while (upperTerminalChunk <= maximumChunk) {
    const bytes = await readChunk(upperTerminalChunk * chunkSize);
    if (bytes < chunkSize) {
      if (bytes > 0) return upperTerminalChunk * chunkSize + bytes;
      break;
    }
    lowerFullChunk = upperTerminalChunk;
    upperTerminalChunk *= 2;
  }
  if (upperTerminalChunk > maximumChunk) return null;

  while (upperTerminalChunk - lowerFullChunk > 1) {
    const candidate = Math.floor((lowerFullChunk + upperTerminalChunk) / 2);
    const bytes = await readChunk(candidate * chunkSize);
    if (bytes === chunkSize) lowerFullChunk = candidate;
    else upperTerminalChunk = candidate;
  }
  const tail = await readChunk(upperTerminalChunk * chunkSize);
  return tail > 0 ? upperTerminalChunk * chunkSize + tail : (lowerFullChunk + 1) * chunkSize;
}

export class GramJsTelegramAdapter implements TelegramAdapter {
  private readonly client: TelegramClient;
  private readonly deleted = new Set<string>();
  private readonly usernames = new Map<string, string | null>();
  private readonly messageGroupCache = new Map<string, { expiresAt: number; messages: Api.Message[] }>();
  private readonly messageGroupInflight = new Map<string, Promise<Api.Message[] | null>>();
  private readonly searchHistoryCache = new Map<string, { expiresAt: number; messages: Api.Message[] }>();
  private readonly searchHistoryOperations = new SharedOperationRegistry<string, Api.Message[]>(30_000);
  private readonly mediaSizeCache = new Map<string, { expiresAt: number; size: number }>();
  private readonly mediaSizeOperations = new SharedOperationRegistry<string, number | null>(60_000);
  private readonly changeHandlers = new Set<(change: ContentChange) => void>();

  constructor(private readonly config: GramConfig) {
    this.client = new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
      baseLogger: new Logger(LogLevel.NONE),
    });
    this.client.setLogLevel(LogLevel.NONE);
  }

  async connect() {
    await this.client.connect();
    if (!(await this.client.checkAuthorization())) throw new Error("TELEGRAM_SESSION is not authorized.");
    this.client.addEventHandler((event: DeletedMessageEvent) => {
      let peer = "*";
      try { if (event.peer) peer = utils.getPeerId(event.peer).toString(); } catch { /* Telegram may omit the peer. */ }
      for (const id of event.deletedIds) this.deleted.add(`${peer}:${id}`);
      if (peer !== "*") this.emitChange({ kind: "deleted", chatId: peer, messageIds: event.deletedIds });
    }, new DeletedMessage({ chats: this.config.allowedChatIds }));
    const onMessage = (kind: "new" | "edited") => (event: NewMessageEvent) => {
      const message = event.message;
      let chatId: string | null = null;
      try { chatId = message.peerId ? utils.getPeerId(message.peerId).toString() : null; } catch { /* Ignore malformed peers. */ }
      if (!chatId || !this.config.allowedChatIds.includes(chatId)) return;
      // Drop cached copies so the next read sees the new or edited message.
      this.messageGroupCache.clear();
      this.searchHistoryCache.delete(chatId);
      this.emitChange({ kind, chatId, messageIds: [message.id] });
    };
    this.client.addEventHandler(onMessage("new"), new NewMessage({ chats: this.config.allowedChatIds }));
    this.client.addEventHandler(onMessage("edited"), new EditedMessage({ chats: this.config.allowedChatIds }));
  }

  private emitChange(change: ContentChange) {
    for (const handler of this.changeHandlers) {
      try { handler(change); } catch { /* A failing subscriber must not break Telegram updates. */ }
    }
  }

  onContentChange(handler: (change: ContentChange) => void) {
    this.changeHandlers.add(handler);
    return () => { this.changeHandlers.delete(handler); };
  }

  async listAdmins(chatId: string, signal: AbortSignal): Promise<TelegramAdmin[]> {
    if (!this.config.allowedChatIds.includes(chatId)) return [];
    signal.throwIfAborted();
    const participants = await this.client.getParticipants(chatId, { filter: new Api.ChannelParticipantsAdmins() });
    signal.throwIfAborted();
    return participants
      .filter((user): user is Api.User => user instanceof Api.User && !user.bot && !user.deleted)
      .map((user) => ({
        userId: user.id.toString(),
        // Names made only of invisible characters (soft hyphens, zero-width spaces) fall back to the username.
        displayName: [user.firstName, user.lastName].filter(Boolean).join(" ").replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/gu, "").trim()
          || (user.username ? `@${user.username}` : user.id.toString()),
        username: user.username ?? null,
      }));
  }

  async close() {
    await this.client.disconnect();
  }

  runtimeState() {
    return {
      inflightOperations: this.messageGroupInflight.size + this.searchHistoryOperations.size + this.mediaSizeOperations.size,
    };
  }

  private async username(chatId: string) {
    if (this.usernames.has(chatId)) return this.usernames.get(chatId) ?? null;
    const entity = await this.client.getEntity(chatId);
    const username = "username" in entity && typeof entity.username === "string" ? entity.username : null;
    this.usernames.set(chatId, username);
    return username;
  }

  private async telegramUrl(chatId: string, messageId: number) {
    const username = await this.username(chatId);
    return username
      ? `https://t.me/${username}/${messageId}`
      : `https://t.me/c/${chatId.replace(/^-100/u, "").replace(/^-/, "")}/${messageId}`;
  }

  async listTopics({ signal }: TopicOptions) {
    const output: BridgeCategory[] = [];
    for (const chatId of this.config.allowedChatIds) {
      signal.throwIfAborted();
      const entity: Entity = await this.client.getEntity(chatId);
      if (!(entity instanceof Api.Channel) || !entity.megagroup || !entity.forum) continue;
      let offsetDate = 0;
      let offsetId = 0;
      let offsetTopic = 0;
      const seen = new Set<number>();
      const found: Api.ForumTopic[] = [];
      for (let page = 0; page < 100; page += 1) {
        signal.throwIfAborted();
        const result = await this.client.invoke(new Api.messages.GetForumTopics({
          peer: entity,
          offsetDate,
          offsetId,
          offsetTopic,
          limit: 100,
        }));
        const topics = result.topics.filter((topic): topic is Api.ForumTopic => topic instanceof Api.ForumTopic);
        let added = 0;
        for (const topic of topics) {
          if (seen.has(topic.id)) continue;
          seen.add(topic.id);
          added += 1;
          found.push(topic);
        }
        if (topics.length < 100 || added === 0) break;
        const last = topics.at(-1)!;
        offsetDate = last.date;
        offsetId = last.topMessage;
        offsetTopic = last.id;
      }
      const messageCounts = await Promise.all(found.map(async (topic) => {
        signal.throwIfAborted();
        const messages = await this.client.getMessages(entity, { replyTo: topic.id, limit: 0 });
        return topicMessageCount(messages.total);
      }));
      output.push(...found.map((topic, index) => ({
        id: createTopicCategoryId(chatId, topic.id),
        slug: createTopicSlug(chatId, topic.id),
        name: cleanText(topic.title),
        defaultSort: "date-desc" as const,
        materialCount: null,
        messageCount: messageCounts[index],
        chatId,
        topicId: topic.id,
        status: topicStatus(topic),
        iconColor: topic.iconColor,
        iconEmojiId: topic.iconEmojiId?.toString() ?? null,
        isGeneral: topic.id === 1,
      })));
    }
    return output;
  }

  private async uncachedAlbumMessages(chatId: string, message: Api.Message) {
    const group = groupedId(message);
    if (!group) return [message];
    const ids = Array.from({ length: 41 }, (_, index) => message.id - 20 + index).filter((id) => id > 0);
    const nearby = await this.client.getMessages(chatId, { ids });
    return nearby.filter(isMessage).filter((candidate) => groupedId(candidate) === group).sort((left, right) => left.id - right.id);
  }

  private rememberMessageGroup(chatId: string, messages: Api.Message[]) {
    const entry = { expiresAt: Date.now() + 15_000, messages };
    for (const message of messages) this.messageGroupCache.set(`${chatId}:${message.id}`, entry);
    while (this.messageGroupCache.size > 300) {
      const oldest = this.messageGroupCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.messageGroupCache.delete(oldest);
    }
  }

  private async messageGroup(chatId: string, messageId: number, seed?: Api.Message) {
    const key = `${chatId}:${messageId}`;
    const cached = this.messageGroupCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.messages;
    const existing = this.messageGroupInflight.get(key);
    if (existing) return existing;
    const pending = (async () => {
      const message = seed ?? (await this.client.getMessages(chatId, { ids: messageId })).find(isMessage);
      if (!message) return null;
      const messages = await this.uncachedAlbumMessages(chatId, message);
      this.rememberMessageGroup(chatId, messages);
      return messages;
    })().finally(() => this.messageGroupInflight.delete(key));
    this.messageGroupInflight.set(key, pending);
    return pending;
  }

  private async recentSearchMessages(chatId: string, signal: AbortSignal) {
    const cached = this.searchHistoryCache.get(chatId);
    if (cached && cached.expiresAt > Date.now()) return cached.messages;
    return this.searchHistoryOperations.run(`search-history:${chatId}`, signal, async (operationSignal) => {
      operationSignal.throwIfAborted();
      const messages = (await this.client.getMessages(chatId, { limit: 500 })).filter(isMessage);
      operationSignal.throwIfAborted();
      this.searchHistoryCache.set(chatId, { expiresAt: Date.now() + 30_000, messages });
      while (this.searchHistoryCache.size > 8) {
        const oldest = this.searchHistoryCache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.searchHistoryCache.delete(oldest);
      }
      return messages;
    });
  }

  private async toPost(chatId: string, messages: Api.Message[], signal?: AbortSignal): Promise<TelegramPost> {
    const ordered = [...messages].sort((left, right) => left.id - right.id);
    const lead = ordered.find((message) => message.richMessage || message.message?.trim()) ?? ordered[0];
    if (lead.richMessage instanceof Api.RichMessage && lead.richMessage.part) {
      signal?.throwIfAborted();
      await lead.fetchRichMessage();
      signal?.throwIfAborted();
    }
    const messageId = ordered[0].id;
    signal?.throwIfAborted();
    const rich = lead.richMessage instanceof Api.RichMessage ? mapRichMessage(lead.richMessage) : null;
    const body = cleanText(rich?.plainText || lead.message || "");
    const poll = pollFor(lead);
    const location = locationFor(lead);
    const sources: MediaSource[] = rich?.mediaSources.length ? rich.mediaSources : ordered;
    const media = sources.map((source, index) => mediaFor(source, index, body || `Telegram media #${messageId}`))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const unsupportedType = !rich && !poll && !location && lead.media && media.length === 0 ? "unknown-attachment" : null;
    const titleSource = body || poll?.question.text || location?.title || media[0]?.title || media[0]?.fileName
      || (unsupportedType ? "Չաջակցվող Telegram նյութ" : `Telegram նյութ #${messageId}`);
    const title = Array.from(titleSource.split("\n").map((line) => line.trim()).find(Boolean) ?? titleSource).slice(0, 240).join("");
    const deleted = this.deleted.has(`${chatId}:${messageId}`) || this.deleted.has(`*:${messageId}`);
    const formatted = mapFormattedText(lead.message ?? "", lead.entities);
    const resolvedTopicId = ordered.map(topicId).find((value): value is number => value !== null) ?? null;
    const draft = {
      id: createMaterialId(chatId, messageId),
      chatId,
      messageId,
      constituentMessageIds: ordered.map((message) => message.id),
      topicId: resolvedTopicId,
      forumTopicId: resolvedTopicId,
      mediaGroupId: groupedId(ordered[0]),
      title,
      telegramUrl: await this.telegramUrl(chatId, messageId),
      contentText: body,
      captionText: media.length ? body : "",
      formattedText: formatted,
      formattedCaption: media.length ? formatted : { text: "", entities: [] },
      richContent: rich?.content ?? null,
      poll,
      location,
      unsupportedType,
      tags: [...new Set([...body.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0].slice(1)))].slice(0, 30),
      publishedAt: isoDate(ordered[0].date),
      editedAt: ordered.map((message) => isoDate(message.editDate)).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      dateValue: isoDate(ordered[0].date)?.slice(0, 10) ?? null,
      numberValue: null,
      media,
      deleted,
      ...messageAuthor(chatId, ordered[0]),
    } satisfies Omit<TelegramPost, "contentType">;
    return { ...draft, contentType: contentTypeFor(draft) };
  }

  private async hydratePage(
    options: HistoryOptions,
    cursor: Cursor,
    candidates: Array<{ chatId: string; message: Api.Message }>,
    mayHaveMore: boolean,
  ): Promise<AdapterPage> {
    candidates.sort((left, right) => (right.message.date ?? 0) - (left.message.date ?? 0) || right.message.id - left.message.id);
    const groups = new Map<string, { chatId: string; messages: Api.Message[] }>();
    let hasUnselectedGroup = false;
    for (const candidate of candidates) {
      const key = `${candidate.chatId}:${groupedId(candidate.message) ?? `message-${candidate.message.id}`}`;
      const existing = groups.get(key);
      if (existing) existing.messages.push(candidate.message);
      else if (groups.size < options.limit) groups.set(key, { chatId: candidate.chatId, messages: [candidate.message] });
      else hasUnselectedGroup = true;
    }
    const hydratedGroups = await Promise.all([...groups.values()].map(async ({ chatId, messages }) => ({
      chatId,
      messages: groupedId(messages[0])
        ? await this.messageGroup(chatId, messages[0].id, messages[0]) ?? messages
        : messages,
    })));
    for (const { chatId, messages } of hydratedGroups) {
      const key = options.topicId ? `${chatId}:${options.topicId}` : chatId;
      const oldestMessageId = Math.min(...messages.map((message) => message.id));
      cursor.offsets[key] = Math.min(cursor.offsets[key] ?? Number.MAX_SAFE_INTEGER, oldestMessageId);
    }
    const posts = await Promise.all(hydratedGroups.map(({ chatId, messages }) => this.toPost(chatId, messages, options.signal)));
    posts.sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "") || right.messageId - left.messageId);
    const nextCursor = mayHaveMore || hasUnselectedGroup ? encodeCursor(cursor) : null;
    return { posts, nextCursor };
  }

  private async page(options: HistoryOptions, search?: string): Promise<AdapterPage> {
    const cursor = cursorValue(options.cursor, options);
    const candidates: Array<{ chatId: string; message: Api.Message }> = [];
    let mayHaveMore = false;
    const chatIds = options.chatId ? [options.chatId] : this.config.allowedChatIds;
    if (options.chatId && !this.config.allowedChatIds.includes(options.chatId)) throw new InvalidPaginationCursorError();
    const allowedCursorKeys = new Set(chatIds.map((chatId) => options.topicId ? `${chatId}:${options.topicId}` : chatId));
    if (Object.keys(cursor.offsets).some((key) => !allowedCursorKeys.has(key))) throw new InvalidPaginationCursorError();
    for (const chatId of chatIds) {
      options.signal.throwIfAborted();
      const key = options.topicId ? `${chatId}:${options.topicId}` : chatId;
      const requestLimit = options.topicId ? Math.min(100, Math.max(options.limit * 2, options.limit + 10)) : options.limit;
      const messages = await this.client.getMessages(chatId, {
        limit: requestLimit,
        offsetId: cursor.offsets[key] ?? 0,
        ...(options.topicId ? { replyTo: options.topicId } : {}),
        ...(search ? { search } : {}),
      });
      const valid = messages.filter(isMessage);
      mayHaveMore ||= valid.length >= requestLimit;
      candidates.push(...valid.map((message) => ({ chatId, message })));
    }
    return this.hydratePage(options, cursor, candidates, mayHaveMore);
  }

  listHistory(options: HistoryOptions) { return this.page(options); }
  async search(options: HistoryOptions) {
    const native = await this.page(options, options.query);
    if (native.posts.length > 0) return native;

    const needle = normalizeSearch(options.query ?? "");
    if (Array.from(needle).length < 2) return native;
    const cursor = cursorValue(options.cursor, options);
    const candidates: Array<{ chatId: string; message: Api.Message }> = [];
    const chatIds = options.chatId ? [options.chatId] : this.config.allowedChatIds;
    let totalMatches = 0;
    for (const chatId of chatIds) {
      const key = options.topicId ? `${chatId}:${options.topicId}` : chatId;
      const offset = cursor.offsets[key] ?? Number.MAX_SAFE_INTEGER;
      const recent = await this.recentSearchMessages(chatId, options.signal);
      const matches = recent.filter((message) =>
        message.id < offset &&
        (!options.topicId || (topicId(message) ?? 1) === options.topicId) &&
        searchableMessageText(message).includes(needle),
      );
      totalMatches += matches.length;
      candidates.push(...matches.map((message) => ({ chatId, message })));
    }
    return this.hydratePage(options, cursor, candidates, totalMatches > options.limit);
  }

  async getPost(chatId: string, messageId: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const messages = await this.messageGroup(chatId, messageId);
    if (!messages) return null;
    return this.toPost(chatId, messages, signal);
  }

  private async mediaSource(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal): Promise<MediaSource | null> {
    const messages = await this.messageGroup(chatId, messageId);
    if (!messages) return null;
    const lead = messages.find((message) => message.richMessage instanceof Api.RichMessage);
    if (lead?.richMessage instanceof Api.RichMessage) {
      if (lead.richMessage.part) {
        signal.throwIfAborted();
        await lead.fetchRichMessage();
        signal.throwIfAborted();
      }
      return mapRichMessage(lead.richMessage).mediaSources[mediaIndex] ?? null;
    }
    return messages[mediaIndex] ?? null;
  }

  private async readMediaProbeChunk(
    resolved: NonNullable<ReturnType<typeof inputLocation>>,
    offset: number,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const iterator = this.client.iterDownload(resolved.location, {
      offset: bigInt(offset),
      requestSize: TELEGRAM_DOWNLOAD_CHUNK_SIZE,
      limit: TELEGRAM_DOWNLOAD_CHUNK_SIZE,
      ...(resolved.dcId ? { dcId: resolved.dcId } : {}),
      signal,
    });
    try {
      const chunk = await iterator.next();
      return chunk.done ? 0 : chunk.value.length;
    } finally {
      await iterator.return(undefined);
    }
  }

  private async mediaSize(
    cacheKey: string,
    resolved: NonNullable<ReturnType<typeof inputLocation>>,
    signal: AbortSignal,
  ) {
    const cached = this.mediaSizeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.size;
    return this.mediaSizeOperations.run(`media-size:${cacheKey}`, signal, async (operationSignal) => {
      const size = await probeUnknownMediaSize((offset) => this.readMediaProbeChunk(resolved, offset, operationSignal));
      operationSignal.throwIfAborted();
      if (size && size > 0) {
        this.mediaSizeCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, size });
        while (this.mediaSizeCache.size > 500) {
          const oldest = this.mediaSizeCache.keys().next().value as string | undefined;
          if (!oldest) break;
          this.mediaSizeCache.delete(oldest);
        }
      }
      return size;
    });
  }

  async getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal, thumbnail = false) {
    signal.throwIfAborted();
    const source = await this.mediaSource(chatId, messageId, mediaIndex, signal);
    if (!source) return null;
    const asset = mediaFor(source, mediaIndex, source instanceof Api.Message ? source.message || `Telegram media #${messageId}` : `Telegram media #${messageId}`);
    if (!asset) return null;
    const resolved = inputLocation(source, thumbnail);
    const resolveSize = async (declaredSize: number | null) => declaredSize && declaredSize > 0
      ? declaredSize
      : resolved
        ? await this.mediaSize(`${chatId}:${messageId}:${mediaIndex}:${thumbnail ? "thumbnail" : "original"}`, resolved, signal)
        : null;
    if (!thumbnail) return { ...asset, sizeBytes: await resolveSize(asset.sizeBytes), chatId, messageId };
    const thumb = thumbnailFor(source);
    return thumb ? {
      ...asset,
      mimeType: "image/jpeg",
      fileName: `${asset.fileName ?? `telegram-${messageId}`}-thumbnail.jpg`,
      sizeBytes: await resolveSize(thumb.size),
      width: thumb.width,
      height: thumb.height,
      duration: null,
      title: null,
      performer: null,
      waveform: null,
      hasThumbnail: false,
      chatId,
      messageId,
      thumbnail: true,
    } : null;
  }

  async *streamMedia({ chatId, messageId, mediaIndex, start, end, thumbnail, signal }: MediaRequest) {
    const source = await this.mediaSource(chatId, messageId, mediaIndex, signal);
    if (!source || (thumbnail && !thumbnailFor(source))) return;
    const resolved = inputLocation(source, Boolean(thumbnail));
    if (!resolved) return;
    const plan = teleprotoDownloadParameters(start, end, resolved.dcId);
    const { leadingBytesToSkip, ...downloadParameters } = plan;
    const iterator = this.client.iterDownload(resolved.location, {
      ...downloadParameters,
      signal,
    });
    let remaining = end - start + 1;
    let skip = leadingBytesToSkip;
    try {
      for await (const chunk of iterator) {
        signal.throwIfAborted();
        if (remaining <= 0) break;
        if (skip >= chunk.length) {
          skip -= chunk.length;
          continue;
        }
        const available = skip > 0 ? chunk.subarray(skip) : chunk;
        skip = 0;
        const output = available.length > remaining ? available.subarray(0, remaining) : available;
        remaining -= output.length;
        yield new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
      }
      if (remaining > 0 && !signal.aborted) throw new Error("Telegram media stream ended before the requested range was complete.");
    } finally {
      await iterator.return(undefined);
    }
  }
}
