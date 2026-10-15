import { timingSafeEqual } from "node:crypto";

import {
  CONTENT_CATEGORIES,
  categoryBySlug,
  type BridgeCategoryMappings,
  type BridgePost,
  type BridgePostPage,
} from "../../../shared/telegram-bridge-contract";
import type { TelegramAdapter, TelegramPost } from "./adapter";
import { classifyPost, parseMappingHeader } from "./category-mapping";
import { parseRangeHeader } from "./range";

type BridgeApplicationOptions = {
  adapter: TelegramAdapter;
  allowedChatIds: ReadonlySet<string>;
  sharedSecret: string;
  mediaConcurrency?: number;
  mediaTimeoutMs?: number;
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

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
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

export function createBridgeApplication(options: BridgeApplicationOptions) {
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(options.sharedSecret)) {
    throw new Error("TELEGRAM_BRIDGE_SHARED_SECRET must contain 32-256 URL-safe characters.");
  }
  const semaphore = new Semaphore(Math.max(1, options.mediaConcurrency ?? 3));
  const timeoutMs = Math.max(1_000, options.mediaTimeoutMs ?? 120_000);

  async function filteredPage(
    mappings: BridgeCategoryMappings,
    cursor: string | null,
    query: string,
    categorySlug: string | null,
    signal: AbortSignal,
    includeUnclassified = false,
  ): Promise<BridgePostPage> {
    const posts: BridgePost[] = [];
    let adapterCursor = cursor;
    let loops = 0;
    do {
      const page = query
        ? await options.adapter.search({ cursor: adapterCursor, limit: 30, query, signal })
        : await options.adapter.listHistory({ cursor: adapterCursor, limit: 30, signal });
      adapterCursor = page.nextCursor;
      for (const raw of page.posts) {
        if (!allowedPost(raw, options.allowedChatIds)) continue;
        const post = classifyPost(raw, mappings);
        if (includeUnclassified ? post.categorySlug : !post.categorySlug || (categorySlug && post.categorySlug !== categorySlug)) continue;
        posts.push(post);
      }
      loops += 1;
    } while (posts.length < 30 && adapterCursor && loops < 100);
    return { posts: posts.slice(0, 30), nextCursor: adapterCursor, total: null };
  }

  return async function handleBridgeRequest(request: Request): Promise<Response> {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || !secureEqual(authorization.slice(7), options.sharedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const mappings = parseMappingHeader(request.headers.get("x-telegram-category-mappings"));

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/categories") {
      const counts = new Map<string, number>();
      let cursor: string | null = null;
      let loops = 0;
      do {
        const page = await options.adapter.listHistory({ cursor, limit: 100, signal: request.signal });
        cursor = page.nextCursor;
        for (const raw of page.posts) {
          if (!allowedPost(raw, options.allowedChatIds)) continue;
          const categoryId = classifyPost(raw, mappings).categoryId;
          if (categoryId) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
        }
        loops += 1;
      } while (cursor && loops < 10_000);
      return json(CONTENT_CATEGORIES.map((category) => ({ ...category, materialCount: counts.get(category.id) ?? 0 })));
    }

    const categoryMatch = /^\/categories\/([a-z0-9-]+)\/posts$/u.exec(url.pathname);
    if (request.method === "GET" && categoryMatch) {
      const category = categoryBySlug(categoryMatch[1]);
      if (!category) return new Response("Not Found", { status: 404 });
      return json(await filteredPage(mappings, url.searchParams.get("cursor"), "", category.slug, request.signal));
    }

    if (request.method === "GET" && url.pathname === "/search") {
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
      const categoryValue = url.searchParams.get("category");
      const category = categoryBySlug(categoryValue) ?? CONTENT_CATEGORIES.find((item) => item.id === categoryValue) ?? null;
      if (!query && !category) return json({ posts: [], nextCursor: null, total: 0 } satisfies BridgePostPage);
      return json(await filteredPage(mappings, url.searchParams.get("cursor"), query, category?.slug ?? null, request.signal));
    }

    if (request.method === "GET" && url.pathname === "/unclassified") {
      return json(await filteredPage(mappings, url.searchParams.get("cursor"), "", null, request.signal, true));
    }

    const postMatch = /^\/posts\/(-?\d{1,20})\/(\d{1,20})$/u.exec(url.pathname);
    if (request.method === "GET" && postMatch) {
      const [, chatId, rawMessageId] = postMatch;
      const messageId = safeInteger(rawMessageId);
      if (!messageId || !options.allowedChatIds.has(chatId)) return new Response("Not Found", { status: 404 });
      const raw = await options.adapter.getPost(chatId, messageId, request.signal);
      if (!raw) return new Response("Not Found", { status: 404 });
      if (raw.deleted) return json({ deleted: true }, 410);
      const post = classifyPost(raw, mappings);
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
      if (!raw || raw.deleted || !classifyPost(raw, mappings).categoryId) return new Response("Not Found", { status: 404 });
      const descriptor = await options.adapter.getMediaDescriptor(chatId, messageId, mediaIndex, request.signal);
      if (!descriptor?.sizeBytes) return new Response("Not Found", { status: 404 });
      const range = parseRangeHeader(request.headers.get("range"), descriptor.sizeBytes);
      if (range === "invalid") {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${descriptor.sizeBytes}`, "accept-ranges": "bytes" } });
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? descriptor.sizeBytes - 1;
      const headers = new Headers({
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
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
      const iterator = options.adapter.streamMedia({ chatId, messageId, mediaIndex, start, end, signal })[Symbol.asyncIterator]();
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
