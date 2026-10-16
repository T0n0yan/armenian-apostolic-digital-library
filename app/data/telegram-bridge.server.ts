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

export async function loadBridgeMappings(database: D1Database): Promise<BridgeCategoryMappings> {
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

async function bridgeFetch(path: string, database: D1Database, init: RequestInit = {}, acceptError = false) {
  const { origin, secret, access } = configuration();
  const mappings = await loadBridgeMappings(database);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${secret}`);
  if (access) {
    headers.set("CF-Access-Client-Id", access.clientId);
    headers.set("CF-Access-Client-Secret", access.clientSecret);
  }
  headers.set("x-telegram-category-mappings", base64Url(JSON.stringify(mappings)));
  const response = await fetch(new URL(path, origin), { ...init, headers });
  if (!response.ok && !acceptError) throw new TelegramBridgeError(response.status);
  return response;
}

export async function listBridgeCategories(database: D1Database, refresh = false) {
  const query = refresh ? "?refresh=1" : "";
  return (await (await bridgeFetch(`/categories${query}`, database, { signal: AbortSignal.timeout(20_000) })).json()) as BridgeCategory[];
}

export async function listBridgeCategoryPosts(database: D1Database, slug: string, cursor: string | null) {
  const search = new URLSearchParams();
  if (cursor) search.set("cursor", cursor);
  const suffix = search.toString();
  return (await (await bridgeFetch(`/categories/${encodeURIComponent(slug)}/posts${suffix ? `?${suffix}` : ""}`, database, {
    signal: AbortSignal.timeout(20_000),
  })).json()) as BridgePostPage;
}

export async function searchBridgePosts(
  database: D1Database,
  query: string,
  category: string,
  cursor: string | null,
) {
  const search = new URLSearchParams({ q: query });
  if (category) search.set("category", category);
  if (cursor) search.set("cursor", cursor);
  return (await (await bridgeFetch(`/search?${search}`, database, { signal: AbortSignal.timeout(20_000) })).json()) as BridgePostPage;
}

export async function listUnclassifiedBridgePosts(database: D1Database, cursor: string | null = null) {
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return (await (await bridgeFetch(`/unclassified${search}`, database, {
    signal: AbortSignal.timeout(20_000),
  })).json()) as BridgePostPage;
}

export async function getBridgePost(database: D1Database, chatId: string, messageId: number) {
  try {
    return (await (await bridgeFetch(`/posts/${encodeURIComponent(chatId)}/${messageId}`, database, {
      signal: AbortSignal.timeout(20_000),
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
) {
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  const thumbnail = new URL(request.url).searchParams.get("thumbnail") === "1" ? "?thumbnail=1" : "";
  return bridgeFetch(`/media/${encodeURIComponent(chatId)}/${messageId}/${mediaIndex}${thumbnail}`, database, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    signal: request.signal,
  }, true);
}
