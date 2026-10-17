import { env } from "cloudflare:workers";

import type {
  BridgeCategory,
  BridgeCategoryMappings,
  BridgePost,
  BridgePostPage,
} from "../../shared/telegram-bridge-contract";
import {
  readTelegramBridgeConfiguration,
  TelegramBridgeError,
  type TelegramBridgeEnvironment,
} from "./telegram-bridge-config.server";
import { loadResolvedValue, ResolvedTtlCache } from "../../shared/async-lifecycle";

export { TelegramBridgeError } from "./telegram-bridge-config.server";

function configuration() {
  return readTelegramBridgeConfiguration(env as Env & TelegramBridgeEnvironment);
}

function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

const mappingCaches = new WeakMap<D1Database, ResolvedTtlCache<string, BridgeCategoryMappings>>();
const mappingGenerations = new WeakMap<D1Database, number>();
const databaseScopes = new WeakMap<D1Database, string>();
const categoryCache = new ResolvedTtlCache<string, readonly BridgeCategory[]>(16);
let nextDatabaseScope = 1;

function mappingCache(database: D1Database) {
  let cache = mappingCaches.get(database);
  if (!cache) {
    cache = new ResolvedTtlCache(8);
    mappingCaches.set(database, cache);
  }
  return cache;
}

function bridgeScope() {
  return configuration().origin.href;
}

function databaseScope(database: D1Database) {
  let scope = databaseScopes.get(database);
  if (!scope) {
    scope = `db-${nextDatabaseScope++}`;
    databaseScopes.set(database, scope);
  }
  return scope;
}

export function invalidateBridgeCaches(database: D1Database) {
  mappingCache(database).invalidate();
  mappingGenerations.set(database, (mappingGenerations.get(database) ?? 0) + 1);
  categoryCache.invalidate();
}

export async function loadBridgeMappings(database: D1Database): Promise<BridgeCategoryMappings> {
  const scope = bridgeScope();
  return loadResolvedValue(mappingCache(database), scope, 30_000, async () => {
    const loaded = await readBridgeMappings(database);
    return Object.freeze({
      topics: Object.freeze({ ...loaded.topics }),
      hashtags: Object.freeze({ ...loaded.hashtags }),
      posts: Object.freeze({ ...loaded.posts }),
    });
  });
}

async function readBridgeMappings(database: D1Database): Promise<BridgeCategoryMappings> {
  const [topics, hashtags, posts] = await Promise.all([
    database.prepare(
      `SELECT sources.chat_id, topics.topic_id, topics.category_id
       FROM telegram_topics AS topics
       INNER JOIN telegram_sources AS sources ON sources.id = topics.source_id`,
    ).all<{ chat_id: string; topic_id: number; category_id: BridgeCategoryMappings["topics"][string] }>(),
    database.prepare("SELECT hashtag, category_id FROM telegram_hashtag_mappings")
      .all<{ hashtag: string; category_id: BridgeCategoryMappings["hashtags"][string] }>(),
    database.prepare("SELECT chat_id, message_id, category_id FROM telegram_post_category_mappings")
      .all<{ chat_id: string; message_id: number; category_id: BridgeCategoryMappings["posts"][string] }>(),
  ]);
  return {
    topics: Object.fromEntries(topics.results.map((row) => [`${row.chat_id}:${row.topic_id}`, row.category_id])),
    hashtags: Object.fromEntries(hashtags.results.map((row) => [row.hashtag, row.category_id])),
    posts: Object.fromEntries(posts.results.map((row) => [`${row.chat_id}:${row.message_id}`, row.category_id])),
  };
}

async function bridgeFetch(
  path: string,
  database: D1Database,
  init: RequestInit = {},
  acceptError = false,
  timeoutMs?: number,
) {
  const startedAt = performance.now();
  const { origin, secret, access, requestTimeoutMs } = configuration();
  const mappingsStartedAt = performance.now();
  const mappings = await loadBridgeMappings(database);
  const mappingsDurationMs = Math.round(performance.now() - mappingsStartedAt);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${secret}`);
  if (access) {
    headers.set("CF-Access-Client-Id", access.clientId);
    headers.set("CF-Access-Client-Secret", access.clientSecret);
  }
  headers.set("x-telegram-category-mappings", base64Url(JSON.stringify(mappings)));
  const timeout = AbortSignal.timeout(timeoutMs ?? requestTimeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let status = 0;
  let outcome: "ok" | "error" | "aborted" = "ok";
  try {
    const response = await fetch(new URL(path, origin), { ...init, headers, signal });
    status = response.status;
    if (!response.ok && !acceptError) throw new TelegramBridgeError(response.status);
    return response;
  } catch (error) {
    outcome = signal.aborted ? "aborted" : "error";
    if (!init.signal?.aborted) {
      throw error instanceof TelegramBridgeError ? error : new TelegramBridgeError(503);
    }
    throw error;
  } finally {
    console.info(JSON.stringify({
      event: "worker_bridge_request",
      kind: bridgeRequestKind(path),
      status,
      outcome,
      mappingsDurationMs,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  }
}

function bridgeRequestKind(path: string) {
  const pathname = path.split("?", 1)[0];
  if (pathname === "/categories") return "topics";
  if (pathname === "/search") return "search";
  if (pathname === "/unclassified") return "unclassified";
  if (/^\/categories\/[^/]+\/posts$/u.test(pathname)) return "topic-posts";
  if (/^\/posts\//u.test(pathname)) return "post";
  if (/^\/media\//u.test(pathname)) return "media";
  return "other";
}

export async function listBridgeCategories(database: D1Database, refresh = false, signal?: AbortSignal) {
  const scope = `${bridgeScope()}|${databaseScope(database)}|mapping:${mappingGenerations.get(database) ?? 0}`;
  const query = refresh ? "?refresh=1" : "";
  const load = async () => {
    const loaded = await (await bridgeFetch(`/categories${query}`, database, { signal })).json() as BridgeCategory[];
    return Object.freeze(loaded.map((category) => Object.freeze({ ...category })));
  };
  const value = refresh ? await load() : await loadResolvedValue(categoryCache, scope, 15_000, load);
  if (refresh) categoryCache.set(scope, value, 15_000);
  return [...value];
}

export async function listBridgeCategoryPosts(database: D1Database, slug: string, cursor: string | null, signal?: AbortSignal) {
  const search = new URLSearchParams();
  if (cursor) search.set("cursor", cursor);
  const suffix = search.toString();
  return (await (await bridgeFetch(`/categories/${encodeURIComponent(slug)}/posts${suffix ? `?${suffix}` : ""}`, database, {
    signal,
  })).json()) as BridgePostPage;
}

export async function searchBridgePosts(
  database: D1Database,
  query: string,
  category: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams({ q: query });
  if (category) search.set("category", category);
  if (cursor) search.set("cursor", cursor);
  return (await (await bridgeFetch(`/search?${search}`, database, { signal })).json()) as BridgePostPage;
}

export async function listUnclassifiedBridgePosts(database: D1Database, cursor: string | null = null, signal?: AbortSignal) {
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return (await (await bridgeFetch(`/unclassified${search}`, database, {
    signal,
  })).json()) as BridgePostPage;
}

export async function getBridgePost(database: D1Database, chatId: string, messageId: number, signal?: AbortSignal) {
  try {
    return (await (await bridgeFetch(`/posts/${encodeURIComponent(chatId)}/${messageId}`, database, {
      signal,
    })).json()) as BridgePost;
  } catch (error) {
    if (error instanceof TelegramBridgeError && (error.status === 404 || error.status === 410)) return null;
    throw error;
  }
}

export function proxyBridgeMedia(
  database: D1Database,
  chatId: string,
  messageId: number,
  mediaIndex: number,
  request: Request,
  mediaClientKey?: string,
) {
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  if (mediaClientKey && /^[a-zA-Z0-9_-]{16,64}$/u.test(mediaClientKey)) {
    headers.set("x-telegram-media-client", mediaClientKey);
  }
  const thumbnail = new URL(request.url).searchParams.get("thumbnail") === "1" ? "?thumbnail=1" : "";
  return bridgeFetch(`/media/${encodeURIComponent(chatId)}/${messageId}/${mediaIndex}${thumbnail}`, database, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    signal: request.signal,
  }, true, 120_000);
}
