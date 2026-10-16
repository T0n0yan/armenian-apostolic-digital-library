import { timingSafeEqual } from "node:crypto";

import {
  parseTopicSlug,
  type BridgeCategory,
  type BridgePost,
  type BridgePostPage,
} from "../../../shared/telegram-bridge-contract";
import type { TelegramAdapter, TelegramPost } from "./adapter";
import { parseRangeHeader } from "./range";

type BridgeApplicationOptions = {
  adapter: TelegramAdapter;
  allowedChatIds: ReadonlySet<string>;
  sharedSecret: string;
  mediaConcurrency?: number;
  mediaTimeoutMs?: number;
  topicCacheTtlMs?: number;
};

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly maximum: number) {}

  async acquire(signal: AbortSignal) {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => { signal.removeEventListener("abort", aborted); resolve(); };
        const aborted = () => {
          const index = this.waiters.indexOf(ready);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(signal.reason);
        };
        signal.addEventListener("abort", aborted, { once: true });
        this.waiters.push(ready);
      });
    }
    signal.throwIfAborted();
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function json(value: unknown, status = 200, cacheControl = "private, no-store") {
  return Response.json(value, {
    status,
    headers: { "cache-control": cacheControl, "x-content-type-options": "nosniff" },
  });
}

function safeInteger(value: string | undefined) {
  if (!value || !/^\d{1,20}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function allowedPost(post: TelegramPost, allowedChatIds: ReadonlySet<string>) {
  return allowedChatIds.has(post.chatId) && !post.deleted;
}

function topicForPost(post: TelegramPost, topics: BridgeCategory[]) {
  const topicId = post.topicId ?? post.forumTopicId ?? 1;
  return topics.find((topic) => topic.chatId === post.chatId && topic.topicId === topicId) ?? null;
}

function categorizePost(post: TelegramPost, topics: BridgeCategory[]): BridgePost {
  const topic = topicForPost(post, topics);
  return {
    ...post,
    topicId: post.topicId ?? post.forumTopicId ?? (topic?.isGeneral ? 1 : null),
    forumTopicId: post.forumTopicId ?? post.topicId ?? (topic?.isGeneral ? 1 : null),
    categoryId: topic?.id ?? null,
    categoryName: topic?.name ?? null,
    categorySlug: topic?.slug ?? null,
  };
}

export function createBridgeApplication(options: BridgeApplicationOptions) {
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(options.sharedSecret)) {
    throw new Error("TELEGRAM_BRIDGE_SHARED_SECRET must contain 32-256 URL-safe characters.");
  }
  const semaphore = new Semaphore(Math.max(1, options.mediaConcurrency ?? 3));
  const timeoutMs = Math.max(1_000, options.mediaTimeoutMs ?? 120_000);
  const topicCacheTtlMs = Math.max(1_000, options.topicCacheTtlMs ?? 15_000);
  let topicCache: { expiresAt: number; value: BridgeCategory[] } | null = null;

  async function topics(refresh: boolean, signal: AbortSignal) {
    if (!refresh && topicCache && topicCache.expiresAt > Date.now()) return topicCache.value;
    const value = (await options.adapter.listTopics({ refresh, signal }))
      .filter((topic) => topic.chatId && options.allowedChatIds.has(topic.chatId));
    topicCache = { expiresAt: Date.now() + topicCacheTtlMs, value };
    return value;
  }

  async function filteredPage(
    availableTopics: BridgeCategory[],
    cursor: string | null,
    query: string,
    categorySlug: string | null,
    signal: AbortSignal,
    includeUnclassified = false,
  ): Promise<BridgePostPage> {
    const category = categorySlug ? availableTopics.find((item) => item.slug === categorySlug) ?? null : null;
    const posts: BridgePost[] = [];
    let adapterCursor = cursor;
    let loops = 0;
    do {
      const page = query
        ? await options.adapter.search({ cursor: adapterCursor, limit: 30, query, signal })
        : category?.chatId && category.topicId
          ? await options.adapter.listHistory({ cursor: adapterCursor, limit: 30, chatId: category.chatId, topicId: category.topicId, signal })
          : await options.adapter.listHistory({ cursor: adapterCursor, limit: 30, signal });
      adapterCursor = page.nextCursor;
      for (const raw of page.posts) {
        if (!allowedPost(raw, options.allowedChatIds)) continue;
        const post = categorizePost(raw, availableTopics);
        if (includeUnclassified ? post.categorySlug : !post.categorySlug) continue;
        if (categorySlug && post.categorySlug !== categorySlug) continue;
        posts.push(post);
      }
      loops += 1;
    } while (posts.length < 30 && adapterCursor && loops < 100);
    return { posts: posts.slice(0, 30), nextCursor: adapterCursor, total: category?.materialCount ?? null };
  }

  return async function handleBridgeRequest(request: Request): Promise<Response> {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || !secureEqual(authorization.slice(7), options.sharedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });

    if (request.method === "GET" && (url.pathname === "/categories" || url.pathname === "/topics")) {
      const refresh = url.searchParams.get("refresh") === "1";
      return json(await topics(refresh, request.signal), 200, "private, max-age=15");
    }

    const categoryMatch = /^\/categories\/([a-z0-9-]+)\/posts$/u.exec(url.pathname);
    if (request.method === "GET" && categoryMatch) {
      const availableTopics = await topics(url.searchParams.get("refresh") === "1", request.signal);
      const reference = parseTopicSlug(categoryMatch[1]);
      const category = reference && availableTopics.find((topic) => topic.slug === categoryMatch[1]);
      if (!category || category.chatId !== reference?.chatId || category.topicId !== reference.topicId) {
        return new Response("Not Found", { status: 404 });
      }
      return json(await filteredPage(availableTopics, url.searchParams.get("cursor"), "", category.slug, request.signal));
    }

    if (request.method === "GET" && url.pathname === "/search") {
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
      const categorySlug = (url.searchParams.get("category") ?? "").trim() || null;
      const availableTopics = await topics(false, request.signal);
      if (categorySlug && !availableTopics.some((topic) => topic.slug === categorySlug || topic.id === categorySlug)) {
        return new Response("Not Found", { status: 404 });
      }
      const category = availableTopics.find((topic) => topic.slug === categorySlug || topic.id === categorySlug) ?? null;
      if (!query && !category) return json({ posts: [], nextCursor: null, total: 0 } satisfies BridgePostPage);
      return json(await filteredPage(availableTopics, url.searchParams.get("cursor"), query, category?.slug ?? null, request.signal));
    }

    if (request.method === "GET" && url.pathname === "/unclassified") {
      const availableTopics = await topics(false, request.signal);
      return json(await filteredPage(availableTopics, url.searchParams.get("cursor"), "", null, request.signal, true));
    }

    const postMatch = /^\/posts\/(-?\d{1,20})\/(\d{1,20})$/u.exec(url.pathname);
    if (request.method === "GET" && postMatch) {
      const [, chatId, rawMessageId] = postMatch;
      const messageId = safeInteger(rawMessageId);
      if (!messageId || !options.allowedChatIds.has(chatId)) return new Response("Not Found", { status: 404 });
      const raw = await options.adapter.getPost(chatId, messageId, request.signal);
      if (!raw) return new Response("Not Found", { status: 404 });
      if (raw.deleted) return json({ deleted: true }, 410);
      const post = categorizePost(raw, await topics(false, request.signal));
      return post.categoryId ? json(post) : new Response("Not Found", { status: 404 });
    }

    const mediaMatch = /^\/media\/(-?\d{1,20})\/(\d{1,20})\/(\d{1,3})$/u.exec(url.pathname);
    if ((request.method === "GET" || request.method === "HEAD") && mediaMatch) {
      const [, chatId, rawMessageId, rawMediaIndex] = mediaMatch;
      const messageId = safeInteger(rawMessageId);
      const mediaIndex = Number(rawMediaIndex);
      if (!messageId || !Number.isSafeInteger(mediaIndex) || mediaIndex < 0 || !options.allowedChatIds.has(chatId)) {
        return new Response("Not Found", { status: 404 });
      }
      const raw = await options.adapter.getPost(chatId, messageId, request.signal);
      const availableTopics = await topics(false, request.signal);
      if (!raw || raw.deleted || !categorizePost(raw, availableTopics).categoryId) return new Response("Not Found", { status: 404 });
      const thumbnail = url.searchParams.get("thumbnail") === "1";
      const descriptor = await options.adapter.getMediaDescriptor(chatId, messageId, mediaIndex, request.signal, thumbnail);
      if (!descriptor?.sizeBytes) return new Response("Not Found", { status: 404 });
      const range = parseRangeHeader(request.headers.get("range"), descriptor.sizeBytes);
      if (range === "invalid") {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${descriptor.sizeBytes}`, "accept-ranges": "bytes" } });
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? descriptor.sizeBytes - 1;
      const headers = new Headers({
        "accept-ranges": "bytes",
        "cache-control": thumbnail ? "private, max-age=300" : "private, no-store",
        "content-length": String(end - start + 1),
        "content-type": descriptor.mimeType ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      if (range) headers.set("content-range", `bytes ${start}-${end}/${descriptor.sizeBytes}`);
      const status = range ? 206 : 200;
      if (request.method === "HEAD") return new Response(null, { status, headers });

      const timeout = AbortSignal.timeout(timeoutMs);
      const streamAbort = new AbortController();
      const signal = AbortSignal.any([request.signal, timeout, streamAbort.signal]);
      let release: (() => void) | null = await semaphore.acquire(signal);
      const iterator = options.adapter.streamMedia({ chatId, messageId, mediaIndex, start, end, thumbnail, signal })[Symbol.asyncIterator]();
      const finish = async () => {
        const current = release;
        release = null;
        current?.();
        await iterator.return?.();
      };
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await iterator.next();
            if (next.done) { controller.close(); await finish(); }
            else controller.enqueue(next.value);
          } catch (error) {
            controller.error(error);
            await finish();
          }
        },
        async cancel() { streamAbort.abort(new Error("Media consumer disconnected.")); await finish(); },
      });
      return new Response(body, { status, headers });
    }

    return new Response("Not Found", { status: 404 });
  };
}
