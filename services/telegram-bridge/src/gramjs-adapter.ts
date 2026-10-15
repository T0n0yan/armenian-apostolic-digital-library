import bigInt from "big-integer";
import { Api, TelegramClient, utils } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { DeletedMessage, type DeletedMessageEvent } from "telegram/events/DeletedMessage.js";

import { createMaterialId } from "../../../shared/telegram-bridge-contract";
import type {
  AdapterPage,
  HistoryOptions,
  MediaDescriptor,
  MediaRequest,
  TelegramAdapter,
  TelegramPost,
} from "./adapter";

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

function kindFor(message: Api.Message): MediaDescriptor["kind"] | null {
  if (message.photo) return "photo";
  if (message.voice) return "voice";
  if (message.audio) return "audio";
  if (message.video || message.videoNote) return "video";
  if (message.gif) return "animation";
  if (message.document) return "document";
  return null;
}

function mediaFor(message: Api.Message, index: number, title: string) {
  const kind = kindFor(message);
  if (!kind || !message.file) return null;
  return {
    index,
    kind,
    mimeType: message.file.mimeType ?? null,
    fileName: typeof message.file.name === "string" ? message.file.name : null,
    sizeBytes: fileSize(message.file.size),
    width: Number(message.file.width) || null,
    height: Number(message.file.height) || null,
    duration: Number(message.file.duration) || null,
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

export class GramJsTelegramAdapter implements TelegramAdapter {
  private readonly client: TelegramClient;
  private readonly deleted = new Set<string>();
  private readonly usernames = new Map<string, string | null>();

  constructor(private readonly config: GramConfig) {
    this.client = new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
    });
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
    await this.client.disconnect();
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

  private async albumMessages(chatId: string, message: Api.Message) {
    const group = groupedId(message);
    if (!group) return [message];
    const ids = Array.from({ length: 41 }, (_, index) => message.id - 20 + index).filter((id) => id > 0);
    const nearby = await this.client.getMessages(chatId, { ids });
    return nearby.filter(isMessage).filter((candidate) => groupedId(candidate) === group).sort((left, right) => left.id - right.id);
  }

  private async toPost(chatId: string, messages: Api.Message[]): Promise<TelegramPost> {
    const ordered = [...messages].sort((left, right) => left.id - right.id);
    const lead = ordered.find((message) => message.message?.trim()) ?? ordered[0];
    const messageId = ordered[0].id;
    const body = lead.message?.normalize("NFC").trim() ?? "";
    const firstLine = body.split("\n").map((line) => line.trim()).find(Boolean);
    const title = Array.from(firstLine || `Telegram նյութ #${messageId}`).slice(0, 240).join("");
    const media = ordered.map((message, index) => mediaFor(message, index, title)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const deleted = this.deleted.has(`${chatId}:${messageId}`) || this.deleted.has(`*:${messageId}`);
    return {
      id: createMaterialId(chatId, messageId),
      chatId,
      messageId,
      forumTopicId: topicId(lead),
      title,
      telegramUrl: await this.telegramUrl(chatId, messageId),
      contentText: body,
      captionText: media.length ? body : "",
      tags: [...new Set([...body.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0].slice(1)))].slice(0, 30),
      publishedAt: isoDate(lead.date),
      editedAt: isoDate(lead.editDate),
      dateValue: isoDate(lead.date)?.slice(0, 10) ?? null,
      numberValue: null,
      media,
      deleted,
    };
  }

  private async page(options: HistoryOptions, search?: string): Promise<AdapterPage> {
    const cursor = cursorValue(options.cursor);
    const candidates: Array<{ chatId: string; message: Api.Message }> = [];
    let mayHaveMore = false;
    for (const chatId of this.config.allowedChatIds) {
      options.signal.throwIfAborted();
      const messages = await this.client.getMessages(chatId, {
        limit: options.limit,
        offsetId: cursor.offsets[chatId] ?? 0,
        ...(search ? { search } : {}),
      });
      const valid = messages.filter(isMessage);
      mayHaveMore ||= valid.length === options.limit;
      candidates.push(...valid.map((message) => ({ chatId, message })));
    }
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
      messages: groupedId(messages[0]) ? await this.albumMessages(chatId, messages[0]) : messages,
    })));
    for (const { chatId, messages } of hydratedGroups) {
      const oldestMessageId = Math.min(...messages.map((message) => message.id));
      cursor.offsets[chatId] = Math.min(cursor.offsets[chatId] ?? Number.MAX_SAFE_INTEGER, oldestMessageId);
    }
    const posts = await Promise.all(hydratedGroups.map(({ chatId, messages }) => this.toPost(chatId, messages)));
    posts.sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "") || right.messageId - left.messageId);
    return { posts, nextCursor: mayHaveMore || candidates.length > selected.length ? encodeCursor(cursor) : null };
  }

  listHistory(options: HistoryOptions) { return this.page(options); }
  search(options: HistoryOptions) { return this.page(options, options.query); }

  async getPost(chatId: string, messageId: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const result = await this.client.getMessages(chatId, { ids: messageId });
    const message = result.find(isMessage);
    if (!message) return null;
    return this.toPost(chatId, await this.albumMessages(chatId, message));
  }

  private async mediaMessage(chatId: string, messageId: number, mediaIndex: number) {
    const result = await this.client.getMessages(chatId, { ids: messageId });
    const message = result.find(isMessage);
    if (!message) return null;
    return (await this.albumMessages(chatId, message))[mediaIndex] ?? null;
  }

  async getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const message = await this.mediaMessage(chatId, messageId, mediaIndex);
    if (!message) return null;
    const asset = mediaFor(message, mediaIndex, message.message || `Telegram media #${messageId}`);
    return asset ? { ...asset, chatId, messageId } : null;
  }

  async *streamMedia({ chatId, messageId, mediaIndex, start, end, signal }: MediaRequest) {
    const message = await this.mediaMessage(chatId, messageId, mediaIndex);
    if (!message?.media) return;
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
