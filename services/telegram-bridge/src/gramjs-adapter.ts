import bigInt from "big-integer";
import { Api, TelegramClient, utils } from "telegram";
import type { Entity } from "telegram/define";
import { StringSession } from "telegram/sessions/index.js";
import { DeletedMessage, type DeletedMessageEvent } from "telegram/events/DeletedMessage.js";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";

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
  HistoryOptions,
  MediaDescriptor,
  MediaRequest,
  TelegramAdapter,
  TelegramPost,
  TopicOptions,
} from "./adapter";
import { getCurrentPollSnapshot, type GramJsPollSnapshot } from "./gramjs-poll-compat";

type GramConfig = {
  apiId: number;
  apiHash: string;
  session: string;
  allowedChatIds: string[];
};

type Cursor = { offsets: Record<string, number> };

function cursorValue(value: string | null): Cursor {
  if (!value) return { offsets: {} };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    return parsed && typeof parsed.offsets === "object" ? parsed : { offsets: {} };
  } catch {
    return { offsets: {} };
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
  return normalizeSearch(`${message.message ?? ""} ${pollQuestion}`);
}

function safeLink(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/iu.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    return ["http:", "https:", "tg:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function formattedText(text: string, entities: Api.TypeMessageEntity[] | undefined): BridgeFormattedText {
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
    else if (entity instanceof Api.MessageEntityPre) type = "pre";
    else if (entity instanceof Api.MessageEntityBlockquote) type = "blockquote";
    else if (entity instanceof Api.MessageEntityTextUrl) { type = "link"; url = safeLink(entity.url); }
    else if (entity instanceof Api.MessageEntityUrl) { type = "link"; url = safeLink(normalized.slice(offset, offset + length)); }
    else if (entity instanceof Api.MessageEntityEmail) { type = "link"; url = safeLink(`mailto:${normalized.slice(offset, offset + length)}`); }
    else if (entity instanceof Api.MessageEntityPhone) { type = "link"; url = safeLink(`tel:${normalized.slice(offset, offset + length)}`); }
    else if (entity instanceof Api.MessageEntityMention) { type = "link"; url = safeLink(`https://t.me/${normalized.slice(offset + 1, offset + length)}`); }
    if (type && (type !== "link" || url)) output.push({ type, offset, length, url });
  }
  return { text: normalized, entities: output };
}

function audioAttribute(message: Api.Message) {
  const document = message.document;
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeAudio => attribute instanceof Api.DocumentAttributeAudio) ?? null;
}

function videoAttribute(message: Api.Message) {
  const document = message.document;
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeVideo => attribute instanceof Api.DocumentAttributeVideo) ?? null;
}

function fileNameAttribute(message: Api.Message) {
  const document = message.document;
  if (!(document instanceof Api.Document)) return null;
  return document.attributes.find((attribute): attribute is Api.DocumentAttributeFilename => attribute instanceof Api.DocumentAttributeFilename) ?? null;
}

function photoMetadata(message: Api.Message) {
  const photo = message.photo;
  if (!(photo instanceof Api.Photo)) return null;
  const sizes = photo.sizes.flatMap((size) => {
    if (size instanceof Api.PhotoSize) return [{ width: size.w, height: size.h, size: size.size }];
    if (size instanceof Api.PhotoSizeProgressive) return [{ width: size.w, height: size.h, size: Math.max(...size.sizes) }];
    return [];
  });
  return sizes.sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? null;
}

function hasThumbnail(message: Api.Message) {
  const photo = message.photo;
  if (photo instanceof Api.Photo && photo.sizes.some((thumb) =>
    thumb instanceof Api.PhotoSize || thumb instanceof Api.PhotoSizeProgressive,
  )) return true;
  const document = message.document;
  return document instanceof Api.Document && (document.thumbs ?? []).some((thumb) =>
    thumb instanceof Api.PhotoSize || thumb instanceof Api.PhotoSizeProgressive,
  );
}

function kindFor(message: Api.Message): MediaDescriptor["kind"] | null {
  if (message.photo) return "photo";
  const audio = audioAttribute(message);
  if (audio?.voice) return "voice";
  if (audio) return "audio";
  const video = videoAttribute(message);
  if (video) return "video";
  if (message.document instanceof Api.Document) {
    if (message.document.mimeType === "image/gif") return "animation";
    return "document";
  }
  return null;
}

function mediaFor(message: Api.Message, index: number, title: string) {
  const kind = kindFor(message);
  if (!kind) return null;
  const audio = audioAttribute(message);
  const video = videoAttribute(message);
  const document = message.document instanceof Api.Document ? message.document : null;
  const photo = photoMetadata(message);
  return {
    index,
    kind,
    mimeType: document?.mimeType ?? (photo ? "image/jpeg" : null),
    fileName: fileNameAttribute(message)?.fileName ?? null,
    sizeBytes: fileSize(document?.size) ?? photo?.size ?? null,
    width: video?.w ?? photo?.width ?? null,
    height: video?.h ?? photo?.height ?? null,
    duration: video?.duration ?? audio?.duration ?? null,
    title: audio?.title ?? null,
    performer: audio?.performer?.trim() || null,
    waveform: audio?.waveform ? Buffer.from(audio.waveform).toString("base64url") : null,
    hasThumbnail: hasThumbnail(message),
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
    question: formattedText(poll.question.text, poll.question.entities),
    options: poll.answers.map((answer) => {
      const result = resultByOption.get(Buffer.from(answer.option).toString("base64url"));
      return {
        text: formattedText(answer.text.text, answer.text.entities),
        voterCount: result?.voters ?? 0,
      };
    }),
    totalVoters: results.totalVoters ?? 0,
    closed: Boolean(poll.closed),
    anonymous: !poll.publicVoters,
    multipleChoice: Boolean(poll.multipleChoice),
    quiz: Boolean(poll.quiz),
  };
}

function pollFor(message: Api.Message): BridgePoll | null {
  if (!(message.media instanceof Api.MessageMediaPoll)) return null;
  return pollDto(message.media.poll, message.media.results);
}

function currentPollDto(snapshot: GramJsPollSnapshot): BridgePoll {
  return pollDto(snapshot, {
    results: snapshot.results,
    totalVoters: snapshot.totalVoters,
    solution: snapshot.solution ?? undefined,
    solutionEntities: snapshot.solutionEntities,
  });
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

function thumbnailFor(message: Api.Message): TelegramThumbnail | null {
  const candidates: TelegramThumbnail[] = [];
  const photo = message.photo;
  const document = message.document;
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

export class GramJsTelegramAdapter implements TelegramAdapter {
  private readonly client: TelegramClient;
  private readonly deleted = new Set<string>();
  private readonly usernames = new Map<string, string | null>();
  private readonly messageGroupCache = new Map<string, { expiresAt: number; messages: Api.Message[] }>();
  private readonly messageGroupInflight = new Map<string, Promise<Api.Message[] | null>>();
  private readonly searchHistoryCache = new Map<string, { expiresAt: number; messages: Api.Message[] }>();
  private readonly searchHistoryInflight = new Map<string, Promise<Api.Message[]>>();

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
    }, new DeletedMessage({ chats: this.config.allowedChatIds }));
  }

  async close() {
    // GramJS 2.26.x stores exported media-DC senders in Maps but its
    // disconnect implementation iterates them with Object.values(). Capture
    // and close them explicitly so local verification and graceful shutdown
    // do not leave sockets/timers behind.
    const internals = this.client as unknown as {
      _destroyed: boolean;
      _exportedSenderPromises?: Map<number, Promise<{ disconnect(): Promise<void> }>>;
      _exportedSenderReleaseTimeouts?: Map<number, ReturnType<typeof setTimeout>>;
    };
    const exportedSenders = [...(internals._exportedSenderPromises?.values() ?? [])];
    for (const timeout of internals._exportedSenderReleaseTimeouts?.values() ?? []) clearTimeout(timeout);
    internals._destroyed = true;
    await this.client.disconnect();
    await Promise.allSettled(exportedSenders.map(async (senderPromise) => (await senderPromise).disconnect()));
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
        const result = await this.client.invoke(new Api.channels.GetForumTopics({
          channel: entity,
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
    const existing = this.searchHistoryInflight.get(chatId);
    if (existing) return existing;
    const pending = (async () => {
      signal.throwIfAborted();
      const messages = (await this.client.getMessages(chatId, { limit: 500 })).filter(isMessage);
      signal.throwIfAborted();
      this.searchHistoryCache.set(chatId, { expiresAt: Date.now() + 30_000, messages });
      return messages;
    })().finally(() => this.searchHistoryInflight.delete(chatId));
    this.searchHistoryInflight.set(chatId, pending);
    return pending;
  }

  private async toPost(chatId: string, messages: Api.Message[], signal?: AbortSignal): Promise<TelegramPost> {
    const ordered = [...messages].sort((left, right) => left.id - right.id);
    const lead = ordered.find((message) => message.message?.trim()) ?? ordered[0];
    const messageId = ordered[0].id;
    const body = cleanText(lead.message ?? "");
    const poll = pollFor(lead) ?? (
      lead.media instanceof Api.MessageMediaUnsupported
        ? await getCurrentPollSnapshot(this.client, chatId, lead.id, signal).then((snapshot) => snapshot ? currentPollDto(snapshot) : null)
        : null
    );
    const location = locationFor(lead);
    const media = ordered.map((message, index) => mediaFor(message, index, body || `Telegram media #${messageId}`))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const unsupportedType = !poll && !location && lead.media && media.length === 0 ? lead.media.className : null;
    const titleSource = body || poll?.question.text || location?.title || media[0]?.title || media[0]?.fileName
      || (unsupportedType ? `Telegram նյութ՝ ${unsupportedType}` : `Telegram նյութ #${messageId}`);
    const title = Array.from(titleSource.split("\n").map((line) => line.trim()).find(Boolean) ?? titleSource).slice(0, 240).join("");
    const deleted = this.deleted.has(`${chatId}:${messageId}`) || this.deleted.has(`*:${messageId}`);
    const formatted = formattedText(lead.message ?? "", lead.entities);
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
    const selected = candidates.slice(0, options.limit);
    const groups = new Map<string, { chatId: string; messages: Api.Message[] }>();
    for (const candidate of selected) {
      const key = `${candidate.chatId}:${groupedId(candidate.message) ?? `message-${candidate.message.id}`}`;
      const existing = groups.get(key);
      if (existing) existing.messages.push(candidate.message);
      else groups.set(key, { chatId: candidate.chatId, messages: [candidate.message] });
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
    return { posts, nextCursor: mayHaveMore || candidates.length > selected.length ? encodeCursor(cursor) : null };
  }

  private async page(options: HistoryOptions, search?: string): Promise<AdapterPage> {
    const cursor = cursorValue(options.cursor);
    const candidates: Array<{ chatId: string; message: Api.Message }> = [];
    let mayHaveMore = false;
    const chatIds = options.chatId ? [options.chatId] : this.config.allowedChatIds;
    for (const chatId of chatIds) {
      options.signal.throwIfAborted();
      const key = options.topicId ? `${chatId}:${options.topicId}` : chatId;
      const requestLimit = options.topicId ? options.limit + 10 : options.limit;
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
    const cursor = cursorValue(options.cursor);
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

  private async mediaMessage(chatId: string, messageId: number, mediaIndex: number) {
    return (await this.messageGroup(chatId, messageId))?.[mediaIndex] ?? null;
  }

  async getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal, thumbnail = false) {
    signal.throwIfAborted();
    const message = await this.mediaMessage(chatId, messageId, mediaIndex);
    if (!message) return null;
    const asset = mediaFor(message, mediaIndex, message.message || `Telegram media #${messageId}`);
    if (!asset) return null;
    if (!thumbnail) return { ...asset, chatId, messageId };
    const thumb = thumbnailFor(message);
    return thumb ? {
      ...asset,
      mimeType: "image/jpeg",
      fileName: `${asset.fileName ?? `telegram-${messageId}`}-thumbnail.jpg`,
      sizeBytes: thumb.size,
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
    const message = await this.mediaMessage(chatId, messageId, mediaIndex);
    if (!message?.media) return;
    if (thumbnail) {
      const thumb = thumbnailFor(message);
      if (!thumb) return;
      const downloaded = await this.client.downloadMedia(message, { thumb: thumb.thumb });
      signal.throwIfAborted();
      if (Buffer.isBuffer(downloaded)) {
        const output = downloaded.subarray(start, end + 1);
        yield new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
      }
      return;
    }
    const requestSize = 512 * 1024;
    const iterator = this.client.iterDownload({
      file: message.media,
      offset: bigInt(start),
      requestSize,
      chunkSize: requestSize,
      fileSize: bigInt(end + 1),
    });
    let remaining = end - start + 1;
    try {
      for await (const chunk of iterator) {
        signal.throwIfAborted();
        if (remaining <= 0) break;
        const output = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        remaining -= output.length;
        yield new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
      }
    } finally {
      await iterator.close();
    }
  }
}
