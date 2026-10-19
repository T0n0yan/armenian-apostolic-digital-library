import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { readTelegramBridgeConfiguration } from "../app/data/telegram-bridge-config.server";
import { getMediaClient } from "../app/auth/media-client.server";
import { isRetryableMediaError, mediaPlaybackStateForEvent } from "../app/utils/media-playback";
import { normalizeThemePreference, resolveTheme } from "../shared/theme";
import { isPendingNavigation } from "../shared/navigation-state";
import { loadResolvedValue, ResolvedTtlCache, SharedOperationRegistry } from "../shared/async-lifecycle";
import { createBridgeApplication, readBridgeApplicationState } from "../services/telegram-bridge/src/app";
import { MediaQueueOverloadedError, MediaScheduler } from "../services/telegram-bridge/src/media-scheduler";
import type { TelegramAdapter } from "../services/telegram-bridge/src/adapter";
import { probeUnknownMediaSize, teleprotoDownloadParameters } from "../services/telegram-bridge/src/gramjs-adapter";
import { TelegramSearchIndex } from "../services/telegram-bridge/src/search-index";
import { classifyPost } from "../services/telegram-bridge/src/category-mapping";
import { activeContentChatIds, readBridgeConfig } from "../services/telegram-bridge/src/config";
import { MockTelegramAdapter, MOCK_CHAT_ID, MOCK_TELEGRAM_POSTS, MOCK_VIDEO_SIZE } from "../services/telegram-bridge/src/mock-adapter";
import { cloudMediaObjectKey, syncTelegramLibrary, telegramMaterialContentHash, type CloudLibrarySyncTarget, type SyncMaterial, type SyncMediaUpload } from "../services/telegram-bridge/src/cloud-sync";
import { cloudMaterialSyncState } from "../services/telegram-bridge/src/wrangler-cloud-target";
import { createTopicCategoryId, createTopicSlug, isBridgeSearchHit, type BridgeCategory, type BridgeCategoryMappings, type BridgePostPage } from "../shared/telegram-bridge-contract";
import { createSearchableTelegramDocument, matchSearchableTelegramDocument, matchSearchableText, normalizeTelegramSearchText, parseTelegramSearchQuery, searchAliases } from "../shared/telegram-search";
import {
  clearNavigationCache,
  loadNavigationData,
  navigationCachePolicy,
  readNavigationCache,
  setNavigationCacheScope,
  writeNavigationCache,
} from "../app/utils/navigation-cache";

const ROOT = resolve(import.meta.dirname, "..");
const BRIDGE_SECRET = "fixture_bridge_secret_000000000000000000";
const BOT_TOKEN = "000000000:fixture-token-not-a-secret";
const ACCESS_CLIENT_ID = "fixture-access-client-id";
const ACCESS_CLIENT_SECRET = "fixture-access-client-secret";
const MOCK_TOPIC_SLUG = createTopicSlug(MOCK_CHAT_ID, 700);
const MOCK_TOPIC_ID = createTopicCategoryId(MOCK_CHAT_ID, 700);
const mappings: BridgeCategoryMappings = {
  topics: { [`${MOCK_CHAT_ID}:700`]: "category_prayers" },
  hashtags: {},
  posts: {},
};
const mappingHeader = Buffer.from(JSON.stringify(mappings)).toString("base64url");
type TestR2Bucket = { put(key: string, value: Uint8Array, options?: unknown): Promise<unknown> };

async function seedCloudLibrary(
  database: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  bucket: TestR2Bucket,
) {
  const adapter = new MockTelegramAdapter();
  const topics = await adapter.listTopics();
  await database.prepare(
    "INSERT INTO library_sources (chat_id,title,source_type,is_forum,status) VALUES (?,'Fixture','supergroup',1,'active')",
  ).bind(MOCK_CHAT_ID).run();
  for (const [index, topic] of topics.entries()) {
    await database.prepare(
      `INSERT INTO library_topics
       (id,chat_id,topic_id,slug,title,default_sort,status,icon_color,icon_emoji_id,is_general,display_order,telegram_message_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(topic.id, MOCK_CHAT_ID, topic.topicId, topic.slug, topic.name, topic.defaultSort, topic.status,
      topic.iconColor, topic.iconEmojiId, topic.isGeneral ? 1 : 0, index, topic.messageCount).run();
  }
  for (const post of MOCK_TELEGRAM_POSTS.filter((item) => !item.deleted)) {
    const hash = await telegramMaterialContentHash(post);
    await database.prepare(
      `INSERT INTO library_materials
       (chat_id,message_id,material_id,topic_key,topic_id,media_group_id,constituent_message_ids_json,content_type,title,
        telegram_url,content_text,caption_text,formatted_text_json,formatted_caption_json,rich_content_json,poll_json,
        location_json,unsupported_type,tags_json,number_value,date_value,published_at,edited_at,content_hash,source_revision,
        sync_state,synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ready',?)`,
    ).bind(post.chatId, post.messageId, post.id, MOCK_TOPIC_ID, post.topicId, post.mediaGroupId,
      JSON.stringify(post.constituentMessageIds), post.contentType, post.title, post.telegramUrl, post.contentText,
      post.captionText, JSON.stringify(post.formattedText), JSON.stringify(post.formattedCaption),
      post.richContent ? JSON.stringify(post.richContent) : null, post.poll ? JSON.stringify(post.poll) : null,
      post.location ? JSON.stringify(post.location) : null, post.unsupportedType, JSON.stringify(post.tags),
      post.numberValue, post.dateValue, post.publishedAt, post.editedAt, hash,
      post.editedAt ?? post.publishedAt ?? String(post.messageId), new Date().toISOString()).run();
    const searchable = createSearchableTelegramDocument({
      ...post,
      categoryId: MOCK_TOPIC_ID,
      categoryName: "Աղոթքներ",
      categorySlug: MOCK_TOPIC_SLUG,
    }, "Աղոթքներ");
    for (const [ordinal, field] of searchable.fields.entries()) {
      const fieldId = `${field.blockId ?? field.kind}-${ordinal}`;
      const normalized = normalizeTelegramSearchText(field.value);
      const aliases = searchAliases(field.value).join(" ");
      await database.prepare(
        `INSERT INTO library_search_documents
         (chat_id,message_id,field_id,ordinal,field_kind,block_id,original_text,normalized_text,aliases_text,is_primary)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(post.chatId, post.messageId, fieldId, ordinal, field.kind, field.blockId, field.value,
        normalized, aliases, field.primary ? 1 : 0).run();
      await database.prepare(
        "INSERT INTO library_search_fts(chat_id,message_id,field_id,normalized_text,aliases_text) VALUES (?,?,?,?,?)",
      ).bind(post.chatId, post.messageId, fieldId, normalized, aliases).run();
    }
    for (const media of post.media) {
      const key = `fixtures/${post.messageId}/${media.index}/original.bin`;
      const thumbnailKey = media.hasThumbnail ? `fixtures/${post.messageId}/${media.index}/thumbnail.bin` : null;
      const bytes = new Uint8Array(16_384).map((_, byteIndex) => (byteIndex + media.index) % 251);
      await bucket.put(key, bytes, { httpMetadata: { contentType: media.mimeType ?? "application/octet-stream" } });
      if (thumbnailKey) await bucket.put(thumbnailKey, bytes.slice(0, 1_024), { httpMetadata: { contentType: "image/jpeg" } });
      await database.prepare(
        `INSERT INTO library_media
         (chat_id,message_id,media_index,source_message_id,kind,mime_type,file_name,size_bytes,width,height,duration,title,
          performer,waveform,alt_text,r2_key,thumbnail_r2_key,sha256,status,uploaded_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ready',?)`,
      ).bind(post.chatId, post.messageId, media.index, post.messageId, media.kind, media.mimeType, media.fileName,
        bytes.byteLength, media.width, media.height, media.duration, media.title, media.performer, media.waveform,
        media.altText, key, thumbnailKey, "a".repeat(64), new Date().toISOString()).run();
    }
  }
}

function delayedValue<T>(value: T, signal: AbortSignal, delayMs = 20) {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => { cleanup(); resolvePromise(value); }, delayMs);
    const aborted = () => { clearTimeout(timer); cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

class MemorySyncTarget implements CloudLibrarySyncTarget {
  readonly materials = new Map<string, string>();
  readonly media = new Set<string>();
  readonly checkpoints = new Map<string, { cursor: string | null; complete: boolean }>();
  readonly failures: string[] = [];
  readonly writes: string[] = [];
  runs = 0;

  async beginRun({ dryRun }: { chatId: string; mode: "dry-run" | "historical" | "incremental" | "reconcile"; dryRun: boolean }) {
    if (!dryRun) this.runs += 1;
    return `run-${this.runs}`;
  }
  async upsertSource({ dryRun }: { chatId: string; topics: BridgeCategory[]; dryRun: boolean }) { if (!dryRun) this.writes.push("source"); }
  async upsertTopic(topic: BridgeCategory, dryRun: boolean) { if (!dryRun) this.writes.push(`topic:${topic.id}`); }
  async getCheckpoint(chatId: string, topicId: number) { return this.checkpoints.get(`${chatId}:${topicId}`) ?? null; }
  async stageMaterial(material: SyncMaterial, dryRun: boolean) {
    const key = `${material.post.chatId}:${material.post.messageId}`;
    const unchanged = this.materials.get(key) === material.contentHash;
    return { mediaToUpload: dryRun || unchanged ? [] : material.post.media.flatMap((media) => {
      const assets = [{ mediaIndex: media.index, thumbnail: false }];
      if (media.hasThumbnail) assets.push({ mediaIndex: media.index, thumbnail: true });
      return assets.filter((asset) => !this.media.has(cloudMediaObjectKey(material, media, asset.thumbnail)));
    }) };
  }
  async uploadMedia(media: SyncMediaUpload, dryRun: boolean) {
    if (dryRun) return;
    let bytes = 0;
    for await (const chunk of media.body) bytes += chunk.byteLength;
    assert.ok(bytes > 0);
    this.media.add(media.objectKey);
    this.writes.push(`media:${media.objectKey}`);
  }
  async commitMaterial(material: SyncMaterial, dryRun: boolean) {
    if (dryRun) return;
    this.materials.set(`${material.post.chatId}:${material.post.messageId}`, material.contentHash);
    this.writes.push(`material:${material.post.messageId}`);
  }
  async recordFailure(input: { code: string; dryRun: boolean }) { if (!input.dryRun) this.failures.push(input.code); }
  async saveCheckpoint(input: { chatId: string; topicId: number; cursor: string | null; complete: boolean; dryRun: boolean }) {
    if (!input.dryRun) this.checkpoints.set(`${input.chatId}:${input.topicId}`, { cursor: input.cursor, complete: input.complete });
  }
  async finishRun() {}
}

test("cloud importer is deterministic, idempotent, resumable and dry-run safe", async () => {
  const adapter = new MockTelegramAdapter();
  const target = new MemorySyncTarget();
  const base = { adapter, target, chatId: MOCK_CHAT_ID, signal: new AbortController().signal };
  const first = await syncTelegramLibrary({ ...base, mode: "incremental", pageSize: 4 });
  assert.equal(first.failed, false);
  assert.equal(target.materials.size, MOCK_TELEGRAM_POSTS.filter((post) => !post.deleted).length);
  const mediaCount = target.media.size;
  const mediaWrites = target.writes.filter((item) => item.startsWith("media:")).length;
  assert.equal(mediaWrites, mediaCount);
  assert.ok([...target.checkpoints.values()].some((checkpoint) => checkpoint.complete));

  await syncTelegramLibrary({ ...base, mode: "incremental", pageSize: 3 });
  assert.equal(target.materials.size, MOCK_TELEGRAM_POSTS.filter((post) => !post.deleted).length);
  assert.equal(target.media.size, mediaCount);
  assert.equal(target.writes.filter((item) => item.startsWith("media:")).length, mediaWrites,
    "unchanged media must not be uploaded twice");

  const dryTarget = new MemorySyncTarget();
  const dry = await syncTelegramLibrary({ ...base, target: dryTarget, mode: "dry-run", maximumMaterials: 5 });
  assert.equal(dry.materialsSeen, 5);
  assert.equal(dryTarget.materials.size, 0);
  assert.equal(dryTarget.media.size, 0);
  assert.deepEqual(dryTarget.writes, []);

  const post = MOCK_TELEGRAM_POSTS.find((item) => item.messageId === 102)!;
  const originalHash = await telegramMaterialContentHash(post);
  const editedHash = await telegramMaterialContentHash({ ...post, editedAt: "2026-10-17T00:00:00.000Z", contentText: `${post.contentText} edit` });
  assert.notEqual(originalHash, editedHash);
  assert.notEqual(
    cloudMediaObjectKey({ post, contentHash: originalHash }, { ...post.media[0]!, index: 0 }),
    cloudMediaObjectKey({ post, contentHash: editedHash }, { ...post.media[0]!, index: 0 }),
  );
});

test("cloud importer preserves metadata but does not publish material with unavailable required media", async () => {
  class PartiallyUnavailableAdapter extends MockTelegramAdapter {
    override async getMediaDescriptor(
      chatId: string,
      messageId: number,
      mediaIndex: number,
      signal: AbortSignal,
      thumbnail = false,
    ) {
      if (messageId === 103 && mediaIndex === 1 && !thumbnail) return null;
      return super.getMediaDescriptor(chatId, messageId, mediaIndex, signal, thumbnail);
    }
  }
  const target = new MemorySyncTarget();
  const result = await syncTelegramLibrary({
    adapter: new PartiallyUnavailableAdapter(),
    target,
    chatId: MOCK_CHAT_ID,
    mode: "incremental",
    signal: new AbortController().signal,
  });
  assert.equal(result.failed, true);
  assert.ok(target.materials.has(`${MOCK_CHAT_ID}:103`), "partial albums must retain their metadata and available media");
  assert.ok(target.failures.includes("media-unavailable"));
  assert.equal(cloudMaterialSyncState({ deleted: false, metadataOnly: false, requiredMediaCount: 4, readyMediaCount: 3 }), "pending_media");
  assert.equal(cloudMaterialSyncState({ deleted: false, metadataOnly: false, requiredMediaCount: 4, readyMediaCount: 4 }), "ready");
  assert.equal(cloudMaterialSyncState({ deleted: false, metadataOnly: false, requiredMediaCount: 0, readyMediaCount: 0 }), "ready");
  assert.equal(cloudMaterialSyncState({ deleted: false, metadataOnly: true, requiredMediaCount: 0, readyMediaCount: 0 }), "pending_media");
});

test("cloud library migration is additive and keeps public/private data separated", () => {
  const sql = readFileSync(resolve(ROOT, "migrations/0012_cloud_library.sql"), "utf8")
    .replace(/^\s*--.*$/gmu, "");
  assert.doesNotMatch(sql, /(?:^|;)\s*(?:DROP|DELETE|UPDATE|ALTER)\b/imu);
  for (const table of [
    "library_sources", "library_topics", "library_materials", "library_material_blocks",
    "library_media", "library_album_members", "library_search_documents", "library_sync_cursors",
    "library_sync_runs", "library_sync_failures",
  ]) assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, "u"));
  assert.doesNotMatch(sql, /\b(?:app_users|saved_materials|personal_note|init_data)\b/iu);
});

function bridgeRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${BRIDGE_SECRET}`);
  headers.set("x-telegram-category-mappings", mappingHeader);
  return new Request(`https://bridge.fixture${path}`, { ...init, headers });
}

function telegramInitData(user: object, authDate = Math.floor(Date.now() / 1_000)) {
  const values = new URLSearchParams({ auth_date: String(authDate), query_id: "fixture-query", user: JSON.stringify(user) });
  const check = [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  values.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return values.toString();
}

test("deterministic query normalization and bounded memory index stay explainable", async () => {
  assert.equal(normalizeTelegramSearchText("  ԵՒ\u0301  աղօթք—TEST  "), "և աղօթք test");
  assert.ok(searchAliases("Սաղմոս").includes("saxmos"));
  assert.ok(searchAliases("Bacat").includes("բացատ"));
  for (const value of ["#67", "67", "id:67", "tg:67"]) {
    assert.equal(parseTelegramSearchQuery(value).messageIdIntent?.messageId, 67);
  }
  assert.equal(parseTelegramSearchQuery("67-րդ").messageIdIntent, null);

  let loads = 0;
  const indexedPost = {
    ...MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 108)!,
    categoryId: MOCK_TOPIC_ID,
    categoryName: "Աղոթքներ",
    categorySlug: MOCK_TOPIC_SLUG,
  };
  const index = new TelegramSearchIndex({
    ttlMs: 60_000,
    maximumDocuments: 10,
    maximumTextCharacters: 10_000,
    load: async () => { loads += 1; await new Promise((resolvePromise) => setTimeout(resolvePromise, 5)); return [indexedPost]; },
  });
  const signal = new AbortController().signal;
  const [first, second] = await Promise.all([
    index.search("Bacat", null, null, 30, signal),
    index.search("Bacar", null, null, 30, signal),
  ]);
  assert.equal(loads, 1, "concurrent cold searches must share one index build");
  assert.equal(first.posts[0]?.searchMatch?.scoreCategory, "exact-token");
  assert.equal(second.posts[0]?.searchMatch?.scoreCategory, "fuzzy");
  assert.equal(index.metrics().documents, 1);
  assert.ok(index.metrics().approximateBytes > 0);
});

test("resolved-only Worker caches never share pending request operations", async () => {
  const cache = new ResolvedTtlCache<string, ReadonlyArray<string>>(4);
  let loads = 0;
  const controllers = Array.from({ length: 10 }, () => new AbortController());
  const requests = controllers.map((controller) => loadResolvedValue(cache, "staging:main:categories", 50, async () => {
    loads += 1;
    return delayedValue(Object.freeze(["topic"]), controller.signal);
  }));
  controllers[0].abort(new Error("first SSR request cancelled"));
  await assert.rejects(requests[0], /cancelled/u);
  assert.deepEqual(await Promise.all(requests.slice(1)), Array.from({ length: 9 }, () => ["topic"]));
  assert.equal(loads, 10, "concurrent cache misses must own independent Worker I/O");
  assert.deepEqual(await loadResolvedValue(cache, "staging:main:categories", 50, async () => {
    throw new Error("resolved cache miss");
  }), ["topic"]);
  cache.invalidate("staging:main:categories");
  assert.deepEqual(await loadResolvedValue(cache, "staging:main:categories", 1, async () => ["refreshed"]), ["refreshed"]);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
  assert.deepEqual(await loadResolvedValue(cache, "staging:main:categories", 50, async () => ["expired"]), ["expired"]);

  const mappingCache = new ResolvedTtlCache<string, string>(2);
  let mappingLoads = 0;
  await Promise.all(Array.from({ length: 3 }, () => loadResolvedValue(mappingCache, "db:source", 50, async () => {
    mappingLoads += 1;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    return "mapping";
  })));
  assert.equal(mappingLoads, 3, "pending D1 mapping promises must not cross request boundaries");
});

test("shared operations isolate caller aborts, clean failures, and retry safely", async () => {
  const registry = new SharedOperationRegistry<string, string>(1_000);
  let operations = 0;
  const controllers = Array.from({ length: 10 }, () => new AbortController());
  const waiters = controllers.map((controller) => registry.run("main:topics", controller.signal, async (signal) => {
    operations += 1;
    return delayedValue("topics", signal, 30);
  }));
  controllers[0].abort(new Error("caller left"));
  await assert.rejects(waiters[0], /caller left/u);
  assert.deepEqual(await Promise.all(waiters.slice(1)), Array(9).fill("topics"));
  assert.equal(operations, 1);
  assert.equal(registry.size, 0);

  let attempts = 0;
  await assert.rejects(registry.run("main:post:42", new AbortController().signal, async () => {
    attempts += 1;
    throw new Error("temporary Telegram failure");
  }), /temporary/u);
  assert.equal(registry.size, 0, "rejected operations must not remain inflight");
  assert.equal(await registry.run("main:post:42", new AbortController().signal, async () => {
    attempts += 1;
    return "retried";
  }), "retried");
  assert.equal(attempts, 2);

  for (const key of ["main:search-history", "main:media-size:66:0"] as const) {
    const first = new AbortController();
    const second = new AbortController();
    const left = registry.run(key, first.signal, (signal) => delayedValue(key, signal, 20));
    const right = registry.run(key, second.signal, (signal) => delayedValue(key, signal, 20));
    first.abort(new Error("individual request aborted"));
    await assert.rejects(left, /individual/u);
    assert.equal(await right, key);
  }
  assert.equal(registry.size, 0);

  const timed = new SharedOperationRegistry<string, string>(10);
  await assert.rejects(timed.run("slow", new AbortController().signal, async (signal) =>
    delayedValue("late", signal, 500)
  ), /timed out/u);
  assert.equal(timed.size, 0);
});

test("Bridge topics and posts keep concurrent waiters alive when one caller aborts", async () => {
  const adapter = new MockTelegramAdapter();
  let topicCalls = 0;
  const originalTopics = adapter.listTopics.bind(adapter);
  (adapter as TelegramAdapter).listTopics = async ({ signal }) => {
    topicCalls += 1;
    await delayedValue(undefined, signal, 30);
    return originalTopics();
  };
  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    operationTimeoutMs: 1_000,
  });
  const topicControllers = Array.from({ length: 10 }, () => new AbortController());
  const topics = topicControllers.map((controller) => app(bridgeRequest("/categories", { signal: controller.signal })));
  topicControllers[0].abort(new Error("topic caller aborted"));
  await assert.rejects(topics[0], /topic caller aborted/u);
  assert.deepEqual((await Promise.all(topics.slice(1))).map((response) => response.status), Array(9).fill(200));
  assert.equal(topicCalls, 1);

  let postCalls = 0;
  const originalPost = adapter.getPost.bind(adapter);
  adapter.getPost = async (chatId, messageId, signal) => {
    postCalls += 1;
    await delayedValue(undefined, signal, 30);
    return originalPost(chatId, messageId, signal);
  };
  const postControllers = Array.from({ length: 10 }, () => new AbortController());
  const posts = postControllers.map((controller) => app(bridgeRequest(`/posts/${MOCK_CHAT_ID}/101`, { signal: controller.signal })));
  postControllers[0].abort(new Error("post caller aborted"));
  await assert.rejects(posts[0], /post caller aborted/u);
  assert.deepEqual((await Promise.all(posts.slice(1))).map((response) => response.status), Array(9).fill(200));
  assert.equal(postCalls, 1);

  const slowAdapter = new MockTelegramAdapter();
  (slowAdapter as TelegramAdapter).listTopics = async ({ signal }) => delayedValue([], signal, 5_000);
  const slowApp = createBridgeApplication({
    adapter: slowAdapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    operationTimeoutMs: 100,
  });
  const startedAt = performance.now();
  const unavailable = await slowApp(bridgeRequest("/categories"));
  assert.equal(unavailable.status, 503);
  assert.ok(performance.now() - startedAt < 1_000, "slow Bridge metadata must fail within a bounded interval");
});

test("search-index build keeps its own lifecycle when one waiter aborts", async () => {
  let builds = 0;
  const post = {
    ...MOCK_TELEGRAM_POSTS[0],
    categoryId: MOCK_TOPIC_ID,
    categoryName: "Աղոթքներ",
    categorySlug: MOCK_TOPIC_SLUG,
  };
  const index = new TelegramSearchIndex({
    ttlMs: 10_000,
    buildTimeoutMs: 1_000,
    load: async (signal) => {
      builds += 1;
      return delayedValue([post], signal, 30);
    },
  });
  const first = new AbortController();
  const second = new AbortController();
  const aborted = index.search("Փորձնական", null, null, 20, first.signal);
  const successful = index.search("Փորձնական", null, null, 20, second.signal);
  first.abort(new Error("search waiter left"));
  await assert.rejects(aborted, /waiter left/u);
  assert.equal((await successful).posts.length, 1);
  assert.equal(builds, 1);
});

test("search hits preserve bounded original UTF-16 spans for exact, transliterated, fuzzy, and emoji text", () => {
  const richPost = { ...MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 112)!, categoryId: MOCK_TOPIC_ID, categoryName: "Աղոթքներ", categorySlug: MOCK_TOPIC_SLUG };
  const richMatch = matchSearchableTelegramDocument(createSearchableTelegramDocument(richPost), parseTelegramSearchQuery("Թավ"));
  assert.equal(richMatch?.hit?.blockId, "block-1");
  assert.equal(richMatch?.hit?.source, "content");
  assert.equal(richMatch?.hit?.snippet.slice(richMatch.hit.snippetMatchStart, richMatch.hit.snippetMatchStart + richMatch.hit.snippetMatchLength), "Թավ");
  assert.ok((richMatch?.hit?.snippet.length ?? 0) <= 262);

  const emoji = matchSearchableText("🙏 Սաղմոս 12 — խաղաղություն", parseTelegramSearchQuery("խաղաղ"));
  assert.equal("🙏 Սաղմոս 12 — խաղաղություն".slice(emoji!.hit!.start, emoji!.hit!.start + emoji!.hit!.length), "խաղաղ");
  assert.equal(emoji?.hit?.start, 15, "hit offset must use original UTF-16 code units after a surrogate pair");
  const normalizedArmenian = matchSearchableText("Տե՛ր, խաղաղություն", parseTelegramSearchQuery("տեր"));
  assert.equal(normalizedArmenian?.hit?.start, 0);
  assert.equal(normalizedArmenian?.hit?.length, "Տե՛ր".length);

  const transliteration = matchSearchableText("Սաղմոս 12", parseTelegramSearchQuery("saxmos"));
  assert.equal(transliteration?.scoreCategory, "transliteration");
  assert.equal(transliteration?.hit?.length, "Սաղմոս".length);
  const fuzzy = matchSearchableText("Bacat Caffe", parseTelegramSearchQuery("Bacar"));
  assert.equal(fuzzy?.scoreCategory, "fuzzy");
  assert.equal(fuzzy?.hit?.snippet.slice(fuzzy.hit.snippetMatchStart, fuzzy.hit.snippetMatchStart + fuzzy.hit.snippetMatchLength), "Bacat");
  assert.equal(isBridgeSearchHit(fuzzy?.hit), true);
  assert.equal(isBridgeSearchHit({ ...fuzzy?.hit, blockId: "../../unsafe" }), false);
  assert.equal(isBridgeSearchHit({ ...fuzzy?.hit, start: 99_999 }), false);
});

test("Teleproto media plan aligns arbitrary browser ranges and preserves the source DC", () => {
  const plan = teleprotoDownloadParameters(100, 700_099, 4);
  assert.equal(plan.limit, 700_100);
  assert.equal(plan.requestSize, 512 * 1024);
  assert.equal(plan.offset.toString(), "0");
  assert.equal(plan.leadingBytesToSkip, 100);
  assert.equal(plan.dcId, 4);

  const seek = teleprotoDownloadParameters(13_508_608, 13_574_143, 2);
  assert.equal(Number(seek.offset.toString()) % seek.requestSize, 0);
  assert.equal(Number(seek.offset.toString()) + seek.leadingBytesToSkip, 13_508_608);
});

test("unknown Telegram media size probing is bounded and does not buffer the whole file", async () => {
  const chunkSize = 512;
  const fileSize = 2_345;
  const offsets: number[] = [];
  const size = await probeUnknownMediaSize(async (offset) => {
    offsets.push(offset);
    return Math.max(0, Math.min(chunkSize, fileSize - offset));
  }, chunkSize, 16 * chunkSize);
  assert.equal(size, fileSize);
  assert.ok(offsets.length < Math.ceil(fileSize / chunkSize), "probing should locate the tail without reading every chunk");
  assert.ok(offsets.every((offset) => offset % chunkSize === 0));
});

test("memory search index enforces configurable document and character ceilings", async () => {
  const template = {
    ...MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 101)!,
    categoryId: MOCK_TOPIC_ID,
    categoryName: "Աղոթքներ",
    categorySlug: MOCK_TOPIC_SLUG,
  };
  const posts = Array.from({ length: 12 }, (_, index) => ({
    ...template,
    id: `${template.id}-${index}`,
    messageId: 1_000 + index,
    constituentMessageIds: [1_000 + index],
    title: `Փնտրելի նյութ ${index}`,
    contentText: `Փնտրելի բովանդակություն ${index}`,
  }));
  const signal = new AbortController().signal;
  const documentBounded = new TelegramSearchIndex({
    maximumDocuments: 10,
    maximumTextCharacters: 1_000_000,
    load: async () => posts,
  });
  await documentBounded.search("փնտրելի", null, null, 30, signal);
  assert.equal(documentBounded.metrics().documents, 10);

  const singleDocumentCharacters = 10_000;
  const characterBounded = new TelegramSearchIndex({
    maximumDocuments: 10,
    maximumTextCharacters: singleDocumentCharacters,
    load: async () => posts.map((post) => ({ ...post, contentText: "ա".repeat(6_000) })),
  });
  await characterBounded.search("փնտրելի", null, null, 30, signal);
  assert.equal(characterBounded.metrics().documents, 1);
  assert.ok(characterBounded.metrics().approximateBytes <= singleDocumentCharacters * 2);
});

test("search pagination uses a stable identity cursor and rejects stale cursors", async () => {
  const template = {
    ...MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 101)!,
    categoryId: MOCK_TOPIC_ID,
    categoryName: "Աղոթքներ",
    categorySlug: MOCK_TOPIC_SLUG,
  };
  const posts = Array.from({ length: 45 }, (_, index) => ({
    ...template,
    id: `${template.id}-page-${index}`,
    messageId: 2_000 - index,
    constituentMessageIds: [2_000 - index],
    title: `Էջավորվող որոնում ${index}`,
    contentText: `Էջավորվող որոնում ${index}`,
    publishedAt: new Date(Date.UTC(2026, 9, 15, 8, 0, 45 - index)).toISOString(),
  }));
  const index = new TelegramSearchIndex({ load: async () => posts });
  const signal = new AbortController().signal;
  const first = await index.search("Էջավորվող", null, null, 20, signal);
  const second = await index.search("Էջավորվող", null, first.nextCursor, 20, signal);
  const third = await index.search("Էջավորվող", null, second.nextCursor, 20, signal);
  assert.deepEqual([first.posts.length, second.posts.length, third.posts.length], [20, 20, 5]);
  assert.equal(new Set([...first.posts, ...second.posts, ...third.posts].map((post) => post.id)).size, 45);
  assert.equal(third.nextCursor, null);
  const withoutAnchor = new TelegramSearchIndex({ load: async () => posts.filter((post) => post.id !== first.posts.at(-1)?.id) });
  const continuedAfterDeletion = await withoutAnchor.search("Էջավորվող", null, first.nextCursor, 20, signal);
  assert.ok(continuedAfterDeletion.posts.length > 0, "a deleted page anchor must not make the next page unavailable");
  assert.ok(continuedAfterDeletion.posts.every((post) => !first.posts.some((firstPost) => firstPost.id === post.id)));
  await assert.rejects(() => index.search("այլ հարցում", null, first.nextCursor, 20, signal), /Invalid pagination cursor/u);
  await assert.rejects(() => index.search("Էջավորվող", null, "not-a-cursor", 20, signal), /Invalid pagination cursor/u);
});

test("Bridge search index paginates beyond two thousand canonical materials", async () => {
  const adapter = new MockTelegramAdapter();
  const template = MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 101)!;
  const history = Array.from({ length: 2_105 }, (_, index) => ({
    ...template,
    id: `${template.id}-history-${index}`,
    messageId: 10_000 + index,
    constituentMessageIds: [10_000 + index],
    title: `Երկար պատմության փնտրելի նյութ ${index}`,
    contentText: `Երկար պատմության փնտրելի բովանդակություն ${index}`,
  }));
  let historyCalls = 0;
  adapter.listTopics = async () => [{
    id: MOCK_TOPIC_ID,
    slug: MOCK_TOPIC_SLUG,
    name: "Աղոթքներ",
    defaultSort: "title-asc",
    materialCount: history.length,
    messageCount: history.length,
    chatId: MOCK_CHAT_ID,
    topicId: 700,
    status: "open",
    iconColor: null,
    iconEmojiId: null,
    isGeneral: false,
  }];
  adapter.listHistory = async ({ cursor, limit }) => {
    historyCalls += 1;
    const offset = cursor ? Number(cursor) : 0;
    const posts = history.slice(offset, offset + limit);
    const nextOffset = offset + posts.length;
    return { posts, nextCursor: nextOffset < history.length ? String(nextOffset) : null };
  };
  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    searchIndexMaximumDocuments: 2_105,
    searchIndexMaximumTextCharacters: 5_000_000,
  });
  const response = await app(bridgeRequest(`/search?q=${encodeURIComponent("փնտրելի")}`));
  const page = await response.json() as BridgePostPage;
  assert.equal(response.status, 200);
  assert.equal(page.total, history.length);
  assert.ok(historyCalls > 20, "history loader must continue past the former 2,000-document boundary");
});

test("mock adapter and authenticated Bridge API cover pagination, search, posts and streaming", async () => {
  const adapter = new MockTelegramAdapter();
  const metrics: string[] = [];
  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    mediaConcurrency: 1,
    onMetric: (metric) => metrics.push(`${metric.operation}:${metric.outcome}`),
  });

  const conflictingMappings: BridgeCategoryMappings = {
    topics: { [`${MOCK_CHAT_ID}:700`]: "category_prayers" },
    hashtags: { "աղոթք": "category_saints_lives" },
    posts: { [`${MOCK_CHAT_ID}:101`]: "category_gospel_teachings" },
  };
  const mappedFixture = MOCK_TELEGRAM_POSTS.find((post) => post.messageId === 101)!;
  assert.equal(classifyPost(mappedFixture, conflictingMappings).categoryId, "category_prayers");
  assert.equal(classifyPost({ ...mappedFixture, forumTopicId: null }, conflictingMappings).categoryId, "category_saints_lives");
  assert.equal(classifyPost({ ...mappedFixture, forumTopicId: null, tags: [] }, conflictingMappings).categoryId, "category_gospel_teachings");

  const first = await adapter.listHistory({ cursor: null, limit: 2, signal: new AbortController().signal });
  assert.equal(first.posts.length, 2);
  assert.ok(first.nextCursor);
  const second = await adapter.listHistory({ cursor: first.nextCursor, limit: 2, signal: new AbortController().signal });
  assert.equal(second.posts.length, 2);
  assert.notEqual(second.posts[0].messageId, first.posts[0].messageId);

  const categories = await (await app(bridgeRequest("/categories"))).json() as Array<{ id: string; materialCount: number }>;
  assert.equal(categories.find((item) => item.id === MOCK_TOPIC_ID)?.materialCount, MOCK_TELEGRAM_POSTS.filter((post) => !post.deleted).length);
  assert.equal(categories.length, 7);
  const page = await (await app(bridgeRequest(`/categories/${MOCK_TOPIC_SLUG}/posts`))).json() as BridgePostPage;
  assert.ok(page.posts.length <= 12, "topic API must use the 12-material initial batch");
  assert.ok(page.posts.some((post) => post.messageId === 101 && post.contentText.includes("խաղաղություն")));
  assert.equal(page.posts.find((post) => post.messageId === 102)?.media[0].kind, "photo");
  assert.deepEqual(page.posts.find((post) => post.messageId === 103)?.media.map((asset) => asset.index), [0, 1]);
  assert.ok(page.posts.find((post) => post.messageId === 104)?.editedAt);
  assert.equal(page.posts.find((post) => post.messageId === 109)?.poll?.totalVoters, 8);
  const serializedPoll = JSON.stringify(page.posts.find((post) => post.messageId === 109)?.poll);
  assert.doesNotMatch(serializedPoll, /chosen|correct|explanation/u);
  assert.equal(page.posts.find((post) => post.messageId === 108)?.location?.venueType, "church");
  assert.equal(page.posts.find((post) => post.messageId === 110)?.contentType, "unsupported");
  assert.equal((await app(bridgeRequest(`/categories/${MOCK_TOPIC_SLUG}/posts?cursor=invalid`))).status, 400);

  const deleted = await app(bridgeRequest(`/posts/${MOCK_CHAT_ID}/105`));
  assert.equal(deleted.status, 410);
  const search = await (await app(bridgeRequest("/search?q=%D5%AD%D5%A1%D5%B2%D5%A1%D5%B2%D5%B8%D6%82%D5%A9%D5%B5%D5%B8%D6%82%D5%B6"))).json() as BridgePostPage;
  assert.ok(search.posts.length >= 1);
  assert.equal((await app(bridgeRequest(`/search?q=${encodeURIComponent("խաղաղություն")}&cursor=invalid`))).status, 400);
  for (const query of ["Սաղմ", "Սաղմոս", "սաղմ", "  Սաղմ  ", "Սաղմ,"]) {
    const response = await app(bridgeRequest(`/search?q=${encodeURIComponent(query)}`));
    assert.equal(response.status, 200);
    assert.ok((await response.json() as BridgePostPage).posts.some((post) => /սաղմ/iu.test(post.title)));
  }
  const expectedSearches = [
    ["Նկարագրություն", 102, "caption"],
    ["կլոր", 109, "poll-question"],
    ["Սաղմոս 50", 109, "poll-option"],
    ["Bacat", 108, "location"],
    ["Bacar", 108, "fuzzy"],
    ["saxmos", 107, "transliteration"],
    ["Խմբագրված", 104, "title"],
  ] as const;
  for (const [query, messageId, reason] of expectedSearches) {
    const response = await app(bridgeRequest(`/search?q=${encodeURIComponent(query)}`));
    assert.equal(response.status, 200);
    const result = (await response.json() as BridgePostPage).posts.find((post) => post.messageId === messageId);
    assert.ok(result, `${query} should find Telegram message ${messageId}`);
    assert.ok(result.searchMatch?.reasons.includes(reason));
  }
  for (const query of ["#67", "67", "id:67", "tg:67"]) {
    const response = await app(bridgeRequest(`/search?q=${encodeURIComponent(query)}`));
    assert.deepEqual((await response.json() as BridgePostPage).posts.map((post) => post.messageId), [67]);
  }
  const wrongTopicId = await app(bridgeRequest(
    `/search?q=${encodeURIComponent("#67")}&category=${encodeURIComponent(createTopicCategoryId(MOCK_CHAT_ID, 701))}`,
  ));
  assert.equal((await wrongTopicId.json() as BridgePostPage).posts.length, 0);
  const albumChild = await app(bridgeRequest(`/search?q=${encodeURIComponent("#111")}`));
  assert.deepEqual((await albumChild.json() as BridgePostPage).posts.map((post) => post.messageId), [103]);
  const unrelated = await app(bridgeRequest(`/search?q=${encodeURIComponent("բոլորովին անհամապատասխան")}`));
  assert.equal((await unrelated.json() as BridgePostPage).posts.length, 0);
  const topicNoMatch = await app(bridgeRequest(
    `/search?q=${encodeURIComponent("օրինակ")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  ));
  assert.equal(topicNoMatch.status, 200);
  assert.equal((await topicNoMatch.json() as BridgePostPage).posts.length, 0);
  const emptyQueryTopicFeed = await app(bridgeRequest(
    `/search?category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  ));
  const emptyQueryTopicPage = await emptyQueryTopicFeed.json() as BridgePostPage;
  assert.equal(emptyQueryTopicFeed.status, 200);
  assert.equal(emptyQueryTopicPage.posts.length, 12);
  assert.ok(emptyQueryTopicPage.nextCursor);
  assert.ok(emptyQueryTopicPage.posts.every((post) => post.topicId === 700));
  const beyondFeedSearch = await app(bridgeRequest(
    `/search?q=${encodeURIComponent("Cursor pagination fixture 5")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  ));
  const beyondFeedPage = await beyondFeedSearch.json() as BridgePostPage;
  assert.equal(beyondFeedSearch.status, 200);
  assert.equal(beyondFeedPage.posts.length, 1, "topic search must cover indexed history beyond the first 12 feed items");
  assert.equal(beyondFeedPage.posts[0].messageId, 96);
  const topicMatch = await app(bridgeRequest(
    `/search?q=${encodeURIComponent("խաղաղություն")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  ));
  const topicMatchPosts = (await topicMatch.json() as BridgePostPage).posts;
  assert.deepEqual(topicMatchPosts.map((post) => post.messageId), [101, 104]);

  const broadAdapter = new MockTelegramAdapter();
  broadAdapter.search = (options) => broadAdapter.listHistory(options);
  const defensiveSearchApp = createBridgeApplication({
    adapter: broadAdapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
  });
  const defensiveNoMatch = await defensiveSearchApp(bridgeRequest(
    `/search?q=${encodeURIComponent("չգտնվող")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  ));
  assert.equal((await defensiveNoMatch.json() as BridgePostPage).posts.length, 0);

  const generalPostAdapter = new MockTelegramAdapter();
  generalPostAdapter.listHistory = async ({ signal }) => {
    signal.throwIfAborted();
    return { posts: [{ ...MOCK_TELEGRAM_POSTS[0], topicId: 1, forumTopicId: 1 }], nextCursor: null };
  };
  const noGeneralSearchApp = createBridgeApplication({
    adapter: generalPostAdapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
  });
  const generalSearch = await noGeneralSearchApp(bridgeRequest(
    `/search?q=${encodeURIComponent("խաղաղություն")}`,
  ));
  assert.equal((await generalSearch.json() as BridgePostPage).posts.length, 0);

  const unauthorized = await app(new Request("https://bridge.fixture/categories"));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /fixture_bridge_secret/u);
  assert.equal((await app(bridgeRequest("/posts/-100999/101"))).status, 404);
  let deniedAdapterCalls = 0;
  const deniedAdapter = new MockTelegramAdapter();
  deniedAdapter.getPost = async (...arguments_) => { deniedAdapterCalls += 1; return adapter.getPost(...arguments_); };
  const denialApp = createBridgeApplication({ adapter: deniedAdapter, allowedChatIds: new Set([MOCK_CHAT_ID]), sharedSecret: BRIDGE_SECRET });
  assert.equal((await denialApp(bridgeRequest("/posts/-100999/101"))).status, 404);
  assert.equal(deniedAdapterCalls, 0, "non-allowlisted chat IDs must be rejected before adapter access");
  assert.deepEqual(await (await app(bridgeRequest("/health"))).json(), { ok: true });
  assert.deepEqual(await (await app(bridgeRequest("/ready"))).json(), { ready: true });

  const unavailable = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    isReady: () => false,
  });
  assert.equal((await unavailable(bridgeRequest("/ready"))).status, 503);

  const head = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(MOCK_VIDEO_SIZE));
  assert.equal(head.headers.get("accept-ranges"), "bytes");

  const range = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=100-199" } }));
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), `bytes 100-199/${MOCK_VIDEO_SIZE}`);
  const bytes = new Uint8Array(await range.arrayBuffer());
  assert.equal(bytes.length, 100);
  assert.equal(bytes[0], 100 % 251);
  const browserInitial = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=0-" } }));
  assert.equal(browserInitial.status, 206);
  assert.equal(browserInitial.headers.get("content-range"), `bytes 0-2097151/${MOCK_VIDEO_SIZE}`);
  assert.equal(browserInitial.headers.get("content-length"), String(2 * 1024 * 1024));
  assert.equal((await browserInitial.arrayBuffer()).byteLength, 2 * 1024 * 1024);
  const browserFollowup = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=2097152-" } }));
  assert.equal(browserFollowup.status, 206);
  assert.equal(browserFollowup.headers.get("content-range"), `bytes 2097152-4194303/${MOCK_VIDEO_SIZE}`);
  assert.equal((await browserFollowup.arrayBuffer()).byteLength, 2 * 1024 * 1024);
  const multiChunk = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=0-614399" } }));
  assert.equal(multiChunk.status, 206);
  assert.equal(multiChunk.headers.get("content-length"), "614400");
  assert.equal(multiChunk.headers.get("content-range"), `bytes 0-614399/${MOCK_VIDEO_SIZE}`);
  assert.equal((await multiChunk.arrayBuffer()).byteLength, 614_400);
  const sequential = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=614400-679935" } }));
  assert.equal(sequential.status, 206);
  assert.equal(sequential.headers.get("content-length"), "65536");
  assert.equal(sequential.headers.get("content-range"), `bytes 614400-679935/${MOCK_VIDEO_SIZE}`);
  assert.equal((await sequential.arrayBuffer()).byteLength, 65_536);
  for (const [messageId, mediaIndex] of [[112, 0], [102, 0], [103, 1], [113, 0]] as const) {
    const mediaHead = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/${messageId}/${mediaIndex}`, { method: "HEAD" }));
    assert.equal(mediaHead.status, 200);
    const mediaRange = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/${messageId}/${mediaIndex}`, { headers: { range: "bytes=0-63" } }));
    assert.equal(mediaRange.status, 206);
    assert.equal((await mediaRange.arrayBuffer()).byteLength, 64);
  }
  const audioHead = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/107/0`, { method: "HEAD" }));
  assert.equal(audioHead.status, 200);
  const audioFirst = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/107/0`, { headers: { range: "bytes=0-127" } }));
  assert.equal(audioFirst.status, 206);
  assert.equal((await audioFirst.arrayBuffer()).byteLength, 128);
  const audioSeek = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/107/0`, { headers: { range: "bytes=4096-4223" } }));
  assert.equal(audioSeek.status, 206);
  assert.equal((await audioSeek.arrayBuffer()).byteLength, 128);
  assert.equal((await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/107/0`, { headers: { range: "bytes=8192-" } }))).status, 416);

  const seek = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=104857600-104857663" } }));
  assert.equal(seek.status, 206);
  assert.equal(seek.headers.get("content-length"), "64");
  assert.equal(seek.headers.get("content-range"), `bytes 104857600-104857663/${MOCK_VIDEO_SIZE}`);
  assert.equal((await seek.arrayBuffer()).byteLength, 64);
  const invalid = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: `bytes=${MOCK_VIDEO_SIZE}-` } }));
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), `bytes */${MOCK_VIDEO_SIZE}`);
  const thumbnail = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0?thumbnail=1`, { headers: { range: "bytes=0-63" } }));
  assert.equal(thumbnail.status, 206);
  assert.equal(thumbnail.headers.get("content-type"), "image/jpeg");
  assert.equal((await thumbnail.arrayBuffer()).byteLength, 64);

  const aborted = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`));
  const reader = aborted.body!.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  assert.equal(adapter.stats.abortedStreams, 1);
  const completedBeforeRetry = adapter.stats.completedStreams;
  const retry = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=0-63" } }));
  assert.equal((await retry.arrayBuffer()).byteLength, 64);
  assert.equal(adapter.stats.completedStreams, completedBeforeRetry + 1, "a retry must open and complete exactly one stream");
  assert.deepEqual(await (await app(bridgeRequest("/ready"))).json(), { ready: true });
  assert.ok(metrics.includes("topics:ok"));
  assert.ok(metrics.includes("search-index-history:ok"));
  assert.ok(metrics.includes("media-descriptor:ok"));
  assert.ok(metrics.includes("media-first-byte:ok"));
});

test("fair bounded media scheduling keeps metadata responsive and releases aborted slots", async () => {
  const firstIdentity = getMediaClient(new Request("https://app.fixture/"));
  assert.ok(firstIdentity.cookie);
  assert.match(firstIdentity.key, /^[a-zA-Z0-9_-]{16,64}$/u);
  const repeatedIdentity = getMediaClient(new Request("https://app.fixture/", {
    headers: { cookie: firstIdentity.cookie!.split(";", 1)[0] },
  }));
  assert.equal(repeatedIdentity.key, firstIdentity.key);
  assert.equal(repeatedIdentity.cookie, null);

  const scheduler = new MediaScheduler(1, 2, 1, 1);
  const firstRelease = await scheduler.acquire("video", "client-a", new AbortController().signal);
  const secondVideo = scheduler.acquire("video", "client-a", new AbortController().signal);
  const audio = scheduler.acquire("audio", "client-b", new AbortController().signal);
  firstRelease();
  const audioRelease = await audio;
  assert.equal(scheduler.activeCount, 1, "a different media key must get the next fair slot");
  audioRelease();
  const secondRelease = await secondVideo;
  secondRelease();
  assert.equal(scheduler.activeCount, 0);
  assert.equal(scheduler.queuedCount, 0);

  const full = new MediaScheduler(1, 1, 1, 1);
  const held = await full.acquire("held", "client-a", new AbortController().signal);
  const queuedController = new AbortController();
  const queued = full.acquire("queued", "client-a", queuedController.signal);
  await assert.rejects(full.acquire("overflow", "client-b", new AbortController().signal), MediaQueueOverloadedError);
  queuedController.abort(new Error("fixture disconnect"));
  await assert.rejects(queued, /fixture disconnect/u);
  held();
  assert.equal(full.activeCount, 0);
  assert.equal(full.queuedCount, 0);

  const perClient = new MediaScheduler(3, 3, 2, 1);
  const clientAFirst = await perClient.acquire("video", "client-a", new AbortController().signal);
  const clientASecond = perClient.acquire("audio", "client-a", new AbortController().signal);
  const clientB = await perClient.acquire("audio", "client-b", new AbortController().signal);
  assert.equal(perClient.activeCount, 2, "one client must not consume another client's available slot");
  clientB();
  clientAFirst();
  const clientASecondRelease = await clientASecond;
  clientASecondRelease();

  const adapter = new MockTelegramAdapter();
  const originalStream = adapter.streamMedia.bind(adapter);
  adapter.streamMedia = async function* (options) {
    for await (const chunk of originalStream(options)) {
      await delayedValue(undefined, options.signal, 5);
      yield chunk;
    }
  };
  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    mediaConcurrency: 2,
    mediaQueueLimit: 4,
    mediaPerAssetConcurrency: 1,
    mediaPerClientConcurrency: 2,
    mediaRangeWindowBytes: 64 * 1024,
  });
  const video = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=0-" } }));
  const audioResponse = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/107/0`, { headers: { range: "bytes=0-" } }));
  const videoReader = video.body!.getReader();
  const audioReader = audioResponse.body!.getReader();
  await Promise.all([videoReader.read(), audioReader.read()]);
  assert.equal((await app(bridgeRequest(`/posts/${MOCK_CHAT_ID}/101`))).status, 200, "metadata must not wait for media slots");
  assert.equal((await app(bridgeRequest(`/categories/${MOCK_TOPIC_SLUG}/posts`))).status, 200);
  await Promise.all([videoReader.cancel(), audioReader.cancel()]);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  assert.deepEqual(readBridgeApplicationState(app), { activeMediaSlots: 0, queuedMediaRequests: 0, inflightOperations: 0 });
  assert.equal((await app(bridgeRequest("/ready"))).status, 200);
});

test("pending navigation, media failure isolation, and metadata abort remain safe", async () => {
  assert.equal(isPendingNavigation("loading", "/materials/example", "/materials/example"), true);
  assert.equal(isPendingNavigation("idle", undefined, "/materials/example"), false);
  assert.equal(mediaPlaybackStateForEvent("initial", "load-start"), "metadata");
  assert.equal(mediaPlaybackStateForEvent("metadata", "waiting"), "buffering");
  assert.equal(mediaPlaybackStateForEvent("buffering", "seeking"), "seeking");
  assert.equal(mediaPlaybackStateForEvent("seeking", "seeked", { paused: false }), "playing");
  assert.equal(mediaPlaybackStateForEvent("playing", "pause", { seeking: true, hasCurrentData: true }), "playing");
  assert.equal(mediaPlaybackStateForEvent("playing", "pause", { seeking: false, hasCurrentData: true }), "paused");
  assert.equal(mediaPlaybackStateForEvent("paused", "error"), "error");
  assert.equal(mediaPlaybackStateForEvent("error", "retry"), "initial");
  assert.equal(mediaPlaybackStateForEvent("playing", "waiting"), "buffering");
  assert.equal(mediaPlaybackStateForEvent("playing", "stalled"), "buffering");
  assert.equal(mediaPlaybackStateForEvent("seeking", "error", { errorCode: 1 }), "seeking");
  assert.equal(mediaPlaybackStateForEvent("playing", "error", { errorCode: 1 }), "buffering");
  assert.equal(mediaPlaybackStateForEvent("playing", "error", { errorCode: 2 }), "error-network");
  assert.equal(mediaPlaybackStateForEvent("playing", "error", { errorCode: 3 }), "error-decode");
  assert.equal(mediaPlaybackStateForEvent("playing", "error", { errorCode: 4 }), "error-unsupported");
  assert.equal(isRetryableMediaError("error-network"), true);
  assert.equal(isRetryableMediaError("error-decode"), false);
  assert.equal(isRetryableMediaError("error-unsupported"), false);
  assert.equal(mediaPlaybackStateForEvent("error-network", "retry"), "initial");

  const mediaSource = readFileSync(resolve(ROOT, "app/components/material-media.tsx"), "utf8");
  const resultCardSource = readFileSync(resolve(ROOT, "app/components/material-result-card.tsx"), "utf8");
  const materialRouteSource = readFileSync(resolve(ROOT, "app/routes/material.tsx"), "utf8");
  const richRendererSource = readFileSync(resolve(ROOT, "app/components/telegram-content.tsx"), "utf8");
  const bridgeAppSource = readFileSync(resolve(ROOT, "services/telegram-bridge/src/app.ts"), "utf8");
  const bridgeServerSource = readFileSync(resolve(ROOT, "services/telegram-bridge/src/server.ts"), "utf8");
  assert.match(mediaSource, /onError=\{\(\) => setFailed\(true\)\}/u);
  assert.match(mediaSource, /data-media-state=\{state\}/u);
  assert.match(mediaSource, /onWaiting/u);
  assert.match(mediaSource, /onSeeking/u);
  assert.match(mediaSource, /onSeeked/u);
  assert.match(mediaSource, /element\.load\(\)/u);
  assert.match(mediaSource, /src: asset\.url/u);
  assert.doesNotMatch(mediaSource, /key=\{(?:state|retry|retryKey)/u, "playback state must not remount the media element");
  // Only an explicit timestamp click (the "library:seek" handler) may move the playhead.
  // Explicit user actions (timestamp links, the audio scrubber and skip buttons) may move it.
  const mediaSourceOutsideSeek = mediaSource
    .replace(/const onSeek = [\s\S]*?window\.addEventListener\("library:seek", onSeek\);/u, "")
    .replace(/const seekTo = [\s\S]*?\n  \};/u, "");
  assert.doesNotMatch(mediaSourceOutsideSeek, /currentTime\s*=/u, "rerenders must not reset playback position");
  assert.match(resultCardSource, /onError=\{\(\) => setThumbnailFailed\(true\)\}/u);
  assert.match(resultCardSource, /state=\{material\.searchHit/u);
  assert.match(resultCardSource, /snippetMatchStart/u);
  assert.match(materialRouteSource, /prefers-reduced-motion/u);
  assert.match(materialRouteSource, /scrollIntoView/u);
  assert.match(materialRouteSource, /isBridgeSearchHit/u);
  assert.match(richRendererSource, /data-search-hit/u);
  assert.match(bridgeAppSource, /finishPromise \?\?=/u);
  assert.match(bridgeServerSource, /reader\.cancel\(error\)/u);
  assert.match(bridgeServerSource, /outgoing\.off\("drain"/u);
  assert.match(mediaSource, /media\.map\(\(asset, index\)/u);
  assert.match(mediaSource, /մյուս մեդիան շարունակում է աշխատել/u);
  const categorySource = readFileSync(resolve(ROOT, "app/routes/category.tsx"), "utf8");
  const searchSource = readFileSync(resolve(ROOT, "app/routes/search.tsx"), "utf8");
  const infiniteSource = readFileSync(resolve(ROOT, "app/components/infinite-load-controls.tsx"), "utf8");
  const rootSource = readFileSync(resolve(ROOT, "app/root.tsx"), "utf8");
  assert.match(categorySource, /clientLoader\.hydrate = true/u);
  assert.match(searchSource, /clientLoader\.hydrate = true/u);
  assert.doesNotMatch(categorySource, /sessionStorage|window\.scrollTo/u);
  assert.match(infiniteSource, /observer\.disconnect\(\)/u);
  assert.match(categorySource, /abortRef\.current\?\.abort\(\)/u);
  assert.match(searchSource, /abortRef\.current\?\.abort\(\)/u);
  assert.match(rootSource, /ScrollRestoration getKey=\{\(\{ pathname, search \}\) => `\$\{pathname\}\$\{search\}`\}/u);
  assert.equal(normalizeThemePreference(null), "system");
  assert.equal(normalizeThemePreference("unexpected"), "system");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false, "dark"), "dark");
  assert.equal(resolveTheme("light", true, "dark"), "light");
  assert.equal(resolveTheme("dark", false, "light"), "dark");
  assert.match(rootSource, /dataset\.themePreference = preference/u);
  assert.match(rootSource, /if \(!webApp\.initData/u);
  assert.match(rootSource, /onEvent\?\.\("viewportChanged", handleSafeArea\)/u);
  assert.match(rootSource, /onEvent\?\.\("themeChanged", handleTheme\)/u);
  assert.doesNotMatch(rootSource, /onEvent\?\.\("viewportChanged", handleTheme\)/u);

  const adapter = new MockTelegramAdapter();
  adapter.search = async ({ signal }) => await new Promise((_, reject) => {
    try { signal.throwIfAborted(); } catch (error) { reject(error); return; }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const app = createBridgeApplication({ adapter, allowedChatIds: new Set([MOCK_CHAT_ID]), sharedSecret: BRIDGE_SECRET });
  const controller = new AbortController();
  const pending = app(bridgeRequest("/search?q=slow-query", { signal: controller.signal }));
  controller.abort(new Error("test abort"));
  await assert.rejects(pending, /test abort/u);

  const timeoutAdapter = new MockTelegramAdapter();
  timeoutAdapter.streamMedia = async function* ({ signal }) {
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(resolvePromise, 5_000);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
    yield new Uint8Array([1]);
  };
  const timeoutApp = createBridgeApplication({
    adapter: timeoutAdapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    mediaTimeoutMs: 1_000,
  });
  const timedOutMedia = await timeoutApp(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, {
    headers: { range: "bytes=0-63" },
  }));
  await assert.rejects(timedOutMedia.arrayBuffer(), /timeout|aborted/iu);

  const truncatedAdapter = new MockTelegramAdapter();
  truncatedAdapter.streamMedia = async function* () {
    yield new Uint8Array(16);
    throw new Error("Telegram media stream ended before the requested range was complete.");
  };
  const truncatedApp = createBridgeApplication({
    adapter: truncatedAdapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
  });
  const truncatedMedia = await truncatedApp(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, {
    headers: { range: "bytes=0-63" },
  }));
  await assert.rejects(truncatedMedia.arrayBuffer(), /ended before|stream/iu);
  assert.deepEqual(await (await truncatedApp(bridgeRequest("/ready"))).json(), { ready: true });

  const previewStatus = spawnSync(process.execPath, ["scripts/staging-preview.mjs", "status"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(previewStatus.status, 0);
  assert.match(previewStatus.stdout, /Supervisor: (?:running|stopped)/u);
  assert.match(previewStatus.stdout, /Bridge: (?:running|stopped)/u);
  assert.match(previewStatus.stdout, /Tunnel: (?:running|stopped)/u);
});

test("bounded navigation cache preserves loaded pages and isolates topic, query, and viewer scope", async () => {
  clearNavigationCache();
  setNavigationCacheScope("guest");
  const topicUrl = "https://app.fixture/categories/topic-a";
  const cachedTopic = {
    navigationCacheScope: "guest",
    materials: Array.from({ length: 24 }, (_, index) => ({ id: `material-${index}` })),
    nextCursor: "opaque-third-page",
  };
  writeNavigationCache("topic-feed", topicUrl, "guest", cachedTopic);
  let serverCalls = 0;
  const restoredTopic = await loadNavigationData("topic-feed", topicUrl, async () => {
    serverCalls += 1;
    return { navigationCacheScope: "guest", materials: [], nextCursor: null };
  });
  assert.equal(serverCalls, 0, "an unchanged topic must not repeat its initial server/Bridge request on Back");
  assert.equal(restoredTopic.materials.length, 24);
  assert.equal(restoredTopic.nextCursor, "opaque-third-page");
  assert.equal(readNavigationCache("topic-feed", "https://app.fixture/categories/topic-b"), null);

  const searchUrl = "https://app.fixture/search?q=%D5%BD%D5%A1%D5%B2%D5%B4&category=topic-a";
  writeNavigationCache("search-results", searchUrl, "guest", {
    navigationCacheScope: "guest",
    materials: [{ id: "search-result" }],
    filters: { query: "սաղմ", categoryId: "topic-a" },
  });
  assert.equal((readNavigationCache<{ materials: unknown[] }>("search-results", searchUrl)?.materials.length), 1);
  assert.equal(readNavigationCache("search-results", "https://app.fixture/search?q=other&category=topic-a"), null);

  setNavigationCacheScope("telegram:user-a");
  assert.equal(readNavigationCache("search-results", searchUrl), null, "guest results must not cross into a user scope");
  writeNavigationCache("search-results", searchUrl, "telegram:user-a", {
    navigationCacheScope: "telegram:user-a",
    personalMaterials: [{ id: "private-note" }],
  });
  setNavigationCacheScope("telegram:user-b");
  assert.equal(readNavigationCache("search-results", searchUrl), null, "personal-note results must not cross users");

  for (let index = 0; index < navigationCachePolicy.maximumEntries + 3; index += 1) {
    writeNavigationCache("topic-feed", `https://app.fixture/categories/topic-${index}`, "telegram:user-b", {
      navigationCacheScope: "telegram:user-b",
      materials: [],
    });
  }
  assert.equal(readNavigationCache("topic-feed", "https://app.fixture/categories/topic-0"), null);
  clearNavigationCache();
});

test("Bridge environment validation rejects unsafe deployment settings", () => {
  const base = {
    TELEGRAM_BRIDGE_ADAPTER: "mock",
    TELEGRAM_BRIDGE_SHARED_SECRET: BRIDGE_SECRET,
    TELEGRAM_ALLOWED_CHAT_IDS: MOCK_CHAT_ID,
  } satisfies NodeJS.ProcessEnv;
  const config = readBridgeConfig(base);
  assert.equal(config.requestConcurrency, 32);
  assert.equal(config.requestTimeoutMs, 30_000);
  assert.equal(config.mediaConcurrency, 3);
  assert.equal(config.mediaQueueLimit, 12);
  assert.equal(config.mediaPerAssetConcurrency, 2);
  assert.equal(config.mediaPerClientConcurrency, 2);
  assert.equal(config.mediaRangeWindowBytes, 2 * 1024 * 1024);
  assert.equal(config.shutdownGraceMs, 30_000);
  assert.equal(config.contentChatId, MOCK_CHAT_ID);
  assert.equal(config.searchIndexMaximumDocuments, 10_000);
  assert.equal(config.searchIndexMaximumTextCharacters, 20_000_000);
  const expandedIndex = readBridgeConfig({
    ...base,
    TELEGRAM_SEARCH_INDEX_MAX_DOCUMENTS: "25000",
    TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS: "50000000",
  });
  assert.equal(expandedIndex.searchIndexMaximumDocuments, 25_000);
  assert.equal(expandedIndex.searchIndexMaximumTextCharacters, 50_000_000);
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_ALLOWED_CHAT_IDS: `${MOCK_CHAT_ID},not-a-chat` }),
    /invalid Telegram chat ID/u,
  );
  const secondaryChatId = "-100901";
  const selectedSource = readBridgeConfig({
    ...base,
    TELEGRAM_ALLOWED_CHAT_IDS: `${MOCK_CHAT_ID},${secondaryChatId}`,
    TELEGRAM_CONTENT_CHAT_ID: secondaryChatId,
  });
  assert.deepEqual(selectedSource.allowedChatIds, [MOCK_CHAT_ID, secondaryChatId]);
  assert.equal(selectedSource.contentChatId, secondaryChatId);
  assert.deepEqual(activeContentChatIds(selectedSource), [secondaryChatId]);
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_ALLOWED_CHAT_IDS: `${MOCK_CHAT_ID},${secondaryChatId}` }),
    /TELEGRAM_CONTENT_CHAT_ID is required/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_CONTENT_CHAT_ID: secondaryChatId }),
    /must be included/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_REQUEST_CONCURRENCY: "0" }),
    /TELEGRAM_REQUEST_CONCURRENCY/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_MEDIA_QUEUE_LIMIT: "101" }),
    /TELEGRAM_MEDIA_QUEUE_LIMIT/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_MEDIA_RANGE_WINDOW_BYTES: "65535" }),
    /TELEGRAM_MEDIA_RANGE_WINDOW_BYTES/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_SEARCH_INDEX_MAX_DOCUMENTS: "50001" }),
    /TELEGRAM_SEARCH_INDEX_MAX_DOCUMENTS/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS: "100000001" }),
    /TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS/u,
  );
  assert.throws(
    () => readBridgeConfig({ ...base, TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS: "9999" }),
    /TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS/u,
  );
});

test("Worker Bridge configuration requires paired Cloudflare Access service-token credentials", () => {
  const base = {
    TELEGRAM_BRIDGE_URL: "https://bridge.fixture",
    TELEGRAM_BRIDGE_SHARED_SECRET: BRIDGE_SECRET,
  };
  assert.equal(readTelegramBridgeConfiguration(base).access, null);
  assert.deepEqual(readTelegramBridgeConfiguration({
    ...base,
    CF_ACCESS_CLIENT_ID: ACCESS_CLIENT_ID,
    CF_ACCESS_CLIENT_SECRET: ACCESS_CLIENT_SECRET,
  }).access, { clientId: ACCESS_CLIENT_ID, clientSecret: ACCESS_CLIENT_SECRET });
  assert.throws(
    () => readTelegramBridgeConfiguration({ ...base, CF_ACCESS_CLIENT_ID: ACCESS_CLIENT_ID }),
    /configuration is incomplete/u,
  );
  assert.throws(
    () => readTelegramBridgeConfiguration({
      TELEGRAM_BRIDGE_URL: base.TELEGRAM_BRIDGE_URL,
      CF_ACCESS_CLIENT_ID: ACCESS_CLIENT_ID,
      CF_ACCESS_CLIENT_SECRET: ACCESS_CLIENT_SECRET,
    }),
    /Telegram Bridge is not configured/u,
  );
});

test("cloud library flows through Worker loaders, SSR, bookmark references and private R2 media", async (context) => {
  const adapter = new MockTelegramAdapter();
  const bridge = createBridgeApplication({ adapter, allowedChatIds: new Set([MOCK_CHAT_ID]), sharedSecret: BRIDGE_SECRET });
  const bridgeRequestPaths: string[] = [];
  const serverRoot = resolve(ROOT, "build/server");
  const serverModules = readdirSync(serverRoot, { recursive: true })
    .filter((path): path is string => typeof path === "string" && path.endsWith(".js"))
    .map((path) => ({ type: "ESModule" as const, path, contents: readFileSync(resolve(serverRoot, path), "utf8") }));
  const options = {
    workers: [{
      name: "bridge-worker-fixture",
      compatibilityDate: "2026-10-06",
      modules: serverModules,
      d1Databases: { DB: "fixture-db" },
      r2Buckets: { MEDIA: "fixture-media" },
      bindings: {
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        TELEGRAM_BRIDGE_URL: "https://bridge.fixture",
        TELEGRAM_BRIDGE_SHARED_SECRET: BRIDGE_SECRET,
        CF_ACCESS_CLIENT_ID: ACCESS_CLIENT_ID,
        CF_ACCESS_CLIENT_SECRET: ACCESS_CLIENT_SECRET,
      },
      outboundService: (request: Request) => {
        bridgeRequestPaths.push(new URL(request.url).pathname + new URL(request.url).search);
        assert.equal(request.headers.get("CF-Access-Client-Id"), ACCESS_CLIENT_ID);
        assert.equal(request.headers.get("CF-Access-Client-Secret"), ACCESS_CLIENT_SECRET);
        assert.equal(request.headers.get("authorization"), `Bearer ${BRIDGE_SECRET}`);
        return bridge(request);
      },
    }],
  } as unknown as Parameters<typeof convertV4MiniflareOptions>[0];
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  context.after(() => mf.dispose());

  const database = await mf.getD1Database("DB");
  const mediaBucket = await mf.getR2Bucket("MEDIA");
  for (const migration of readdirSync(resolve(ROOT, "migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = readFileSync(resolve(ROOT, "migrations", migration), "utf8")
      .replace(/^\s*--.*$/gmu, "").split(";").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await database.prepare(statement).run();
  }
  await database.prepare(
    "INSERT INTO telegram_sources (id,chat_id,title,chat_type) VALUES ('fixture-source',?,'Fixture','channel')",
  ).bind(MOCK_CHAT_ID).run();
  await database.prepare(
    "INSERT INTO telegram_topics (source_id,topic_id,title,category_id) VALUES ('fixture-source',700,'Prayer','category_prayers')",
  ).run();
  await seedCloudLibrary(database, mediaBucket as unknown as TestR2Bucket);

  const home = await mf.dispatchFetch("https://app.fixture/");
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Աղոթքներ/u);
  assert.doesNotMatch(homeHtml, />General</u);
  for (const topic of ["Աղոթքներ", "Սրբերի կյանք", "Ավետարանի ուսուցում", "Սաղմոսներ", "Հարցեր Աստվածաշնչից", "Օրվա ընթերցանություն"]) {
    assert.match(homeHtml, new RegExp(topic, "u"));
  }
  const category = await mf.dispatchFetch(`https://app.fixture/categories/${MOCK_TOPIC_SLUG}`);
  const categoryHtml = await category.text();
  assert.match(categoryHtml, /Առավոտյան աղոթք/u);
  // Prayers use the compact text layout: no thumbnail column, and a type badge only for non-text posts.
  for (const label of ["Նկար", "2 նկար", "Տեսանյութ", "Հարցում", "Տեղադրություն", "Այլ նյութ"]) {
    assert.match(categoryHtml, new RegExp(label, "u"));
  }
  assert.doesNotMatch(categoryHtml, />Տեքստ</u);
  assert.doesNotMatch(categoryHtml, /aspect-\[4\/3\]/u);
  assert.match(categoryHtml, /Բեռնել ավելին/u);
  const firstCategoryPage = await mf.dispatchFetch(`https://app.fixture/api/categories/${MOCK_TOPIC_SLUG}/posts`);
  const firstCategoryData = await firstCategoryPage.json() as { materials: Array<{ id: string }>; nextCursor: string | null };
  assert.equal(firstCategoryPage.status, 200);
  assert.equal(firstCategoryData.materials.length, 12);
  assert.ok(firstCategoryData.nextCursor);
  const secondCategoryPage = await mf.dispatchFetch(
    `https://app.fixture/api/categories/${MOCK_TOPIC_SLUG}/posts?cursor=${encodeURIComponent(firstCategoryData.nextCursor!)}`,
  );
  const secondCategoryData = await secondCategoryPage.json() as { materials: Array<{ id: string }>; nextCursor: string | null };
  assert.equal(secondCategoryPage.status, 200);
  assert.equal(secondCategoryData.nextCursor, null);
  assert.equal(
    new Set([...firstCategoryData.materials, ...secondCategoryData.materials].map((material) => material.id)).size,
    MOCK_TELEGRAM_POSTS.filter((post) => !post.deleted).length,
  );
  assert.equal((await mf.dispatchFetch(`https://app.fixture/api/categories/${MOCK_TOPIC_SLUG}/posts?cursor=invalid`)).status, 400);

  const guestSaved = await mf.dispatchFetch("https://app.fixture/saved");
  assert.equal(guestSaved.status, 200);
  assert.match(await guestSaved.text(), /Մտիր, որ պահես նյութեր/u);

  const imagePage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_102");
  const imageHtml = await imagePage.text();
  assert.equal(imagePage.status, 200);
  assert.match(imageHtml, /<img/u);
  assert.match(imageHtml, /<img[^>]+thumbnail=1/u);
  const richPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_112");
  const richHtml = await richPage.text();
  // The leading rich heading repeats the page title, so it renders once in the header, not again in the body.
  assert.match(richHtml, /<h1[^>]*>.*աչափված ընթերցում<\/span><\/h1>/su);
  assert.doesNotMatch(richHtml, /<h2[^>]*>Ձևաչափված ընթերցում<\/h2>/u);
  // The fixture topic is Prayers, so the first letter is a bird-letter initial.
  assert.match(richHtml, /<strong><span class="ornate-initial">Թ<\/span>ավ տեքստ<\/strong>/u);
  assert.match(richHtml, /<blockquote/u);
  assert.match(richHtml, /Նկարի բացատրություն/u);
  assert.doesNotMatch(richHtml, /dangerouslySetInnerHTML|javascript:/u);
  const formattedPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_101");
  assert.match(await formattedPage.text(), /<strong><span class="ornate-initial">Տ<\/span><\/strong><strong>ե՛ր<\/strong>/u);
  const videoPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_106");
  const videoHtml = await videoPage.text();
  assert.match(videoHtml, /<video/u);
  assert.match(videoHtml, /thumbnail=1/u);
  const pollPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_109");
  const pollHtml = await pollPage.text();
  // A guest sees the poll with a prompt to sign in to vote, and the link to Telegram.
  assert.match(pollHtml, /Քվեարկելու համար մուտք գործեք/u);
  assert.doesNotMatch(pollHtml, /Ընտրված պատասխան|Ճիշտ պատասխան|explanation/u);
  const locationPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_108");
  assert.match(await locationPage.text(), /Բացել քարտեզում/u);
  const unsupportedPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_110");
  assert.match(await unsupportedPage.text(), /Telegram-ում հասանելի հավելված կամ ձևաչափ/u);
  assert.doesNotMatch(await (await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_110")).text(), /MessageMediaUnsupported/u);
  const voicePage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_107");
  assert.match(await voicePage.text(), /<audio/u);
  assert.doesNotMatch(
    `${imageHtml}${videoHtml}`,
    /fixture_bridge_secret|fixture-access-client|TELEGRAM_SESSION|TELEGRAM_API_HASH/u,
  );

  const proxiedRange = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", { headers: { range: "bytes=2048-4095" } });
  assert.equal(proxiedRange.status, 206);
  assert.equal(proxiedRange.headers.get("content-length"), "2048");
  assert.equal((await proxiedRange.arrayBuffer()).byteLength, 2048);
  const proxiedHead = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", { method: "HEAD" });
  assert.equal(proxiedHead.status, 200);
  assert.equal(proxiedHead.headers.get("content-length"), "16384");
  const invalidRange = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", { headers: { range: "bytes=999999-1000000" } });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("content-range"), "bytes */16384");
  assert.equal((await mf.dispatchFetch("https://app.fixture/media/-100999/106/0")).status, 404);

  const rangeBoundary = 2 * 1024 * 1024;
  const largeVideo = new Uint8Array(rangeBoundary + 65_536).map((_, index) => index % 251);
  await (mediaBucket as unknown as TestR2Bucket).put("fixtures/106/0/original.bin", largeVideo, { httpMetadata: { contentType: "video/mp4" } });
  const browserInitial = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: "bytes=0-" },
  });
  assert.equal(browserInitial.status, 206);
  assert.equal(browserInitial.headers.get("content-range"), `bytes 0-${largeVideo.byteLength - 1}/${largeVideo.byteLength}`);
  assert.equal(browserInitial.headers.get("content-length"), String(largeVideo.byteLength));
  assert.equal(browserInitial.headers.get("content-encoding"), null);
  assert.deepEqual(new Uint8Array(await browserInitial.arrayBuffer()), largeVideo);
  const browserFollowup = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: `bytes=${rangeBoundary}-` },
  });
  assert.equal(browserFollowup.status, 206);
  assert.equal(browserFollowup.headers.get("content-range"), `bytes ${rangeBoundary}-${largeVideo.byteLength - 1}/${largeVideo.byteLength}`);
  assert.equal(browserFollowup.headers.get("content-length"), "65536");
  assert.equal((await browserFollowup.arrayBuffer()).byteLength, 65_536);
  const suffixRange = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: "bytes=-32768" },
  });
  assert.equal(suffixRange.status, 206);
  assert.equal(suffixRange.headers.get("content-range"), `bytes ${largeVideo.byteLength - 32_768}-${largeVideo.byteLength - 1}/${largeVideo.byteLength}`);
  assert.equal((await suffixRange.arrayBuffer()).byteLength, 32_768);
  assert.equal((await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: "bytes=0-10,20-30" },
  })).status, 416);
  const cancelled = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: "bytes=0-" },
  });
  const cancelledReader = cancelled.body!.getReader();
  await cancelledReader.read();
  await cancelledReader.cancel();
  const afterCancel = await mf.dispatchFetch("https://app.fixture/media/-100900/106/0", {
    headers: { range: "bytes=4096-8191" },
  });
  assert.equal(afterCancel.status, 206);
  assert.deepEqual(new Uint8Array(await afterCancel.arrayBuffer()), largeVideo.slice(4096, 8192));

  const search = await mf.dispatchFetch(`https://app.fixture/search?q=%D5%AD%D5%A1%D5%B2%D5%A1%D5%B2%D5%B8%D6%82%D5%A9%D5%B5%D5%B8%D6%82%D5%B6&category=${encodeURIComponent(MOCK_TOPIC_ID)}`);
  assert.match(await search.text(), /Առավոտյան աղոթք/u);
  const prefixSearch = await mf.dispatchFetch(`https://app.fixture/search?q=${encodeURIComponent("Սաղմ")}`);
  const prefixSearchHtml = await prefixSearch.text();
  assert.equal(prefixSearch.status, 200);
  assert.match(prefixSearchHtml, /Սաղմոս 12/u);
  assert.match(prefixSearchHtml, /Հարցում/u);
  const searchCallsBeforeLanding = bridgeRequestPaths.filter((path) => path.startsWith("/search?")).length;
  const searchLanding = await mf.dispatchFetch("https://app.fixture/search");
  assert.equal(searchLanding.status, 200);
  assert.match(await searchLanding.text(), /Գրիր այն, ինչ փնտրում ես/u);
  assert.equal(
    bridgeRequestPaths.filter((path) => path.startsWith("/search?")).length,
    searchCallsBeforeLanding,
    "An empty search landing must not call the Bridge search endpoint.",
  );
  const filteredLanding = await mf.dispatchFetch(
    `https://app.fixture/search?category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  );
  const filteredLandingHtml = await filteredLanding.text();
  assert.equal(filteredLanding.status, 200);
  assert.match(filteredLandingHtml, /Առավոտյան աղոթք/u);
  assert.match(filteredLandingHtml, /Բեռնել ավելին/u);

  const topicNoMatch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("օրինակ")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  );
  const topicNoMatchHtml = await topicNoMatch.text();
  assert.equal(topicNoMatch.status, 200);
  assert.doesNotMatch(topicNoMatchHtml, /data-material-id=/u);
  assert.match(topicNoMatchHtml, /Այս բաժնում արդյունք չկա/u);
  assert.match(topicNoMatchHtml, /Փորձել բոլոր բաժիններում/u);
  const topicMatch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("խաղաղություն")}&category=${encodeURIComponent(MOCK_TOPIC_ID)}`,
  );
  const topicMatchHtml = await topicMatch.text();
  assert.match(topicMatchHtml, /data-material-id="material_tg_n100900_101"/u);
  assert.match(topicMatchHtml, /data-material-id="material_tg_n100900_104"/u);
  assert.equal((topicMatchHtml.match(/data-material-id=/gu) ?? []).length, 2);
  // The found line is shown on its own, without a "from the text" label.
  assert.doesNotMatch(topicMatchHtml, /Նյութի տեքստից/u);
  assert.match(topicMatchHtml, /<mark[^>]*>խաղաղություն<\/mark>/iu);
  assert.doesNotMatch(topicMatchHtml, /href="\/materials\/[^"?]+\?q=/u);

  const session = await mf.dispatchFetch("https://app.fixture/telegram/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.fixture" },
    body: JSON.stringify({ initData: telegramInitData({ id: 70001, first_name: "Fixture", last_name: "User" }) }),
  });
  const cookie = (session.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.equal(session.status, 200);
  const save = await mf.dispatchFetch("https://app.fixture/saved", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://app.fixture", cookie },
    body: new URLSearchParams({ intent: "save", materialId: "material_tg_n100900_101", personalNote: "Իմ օրինակ խաղաղություն նշումը" }),
  });
  assert.equal(save.status, 200);
  const savedReference = await database.prepare("SELECT user_id,chat_id,message_id,personal_note FROM saved_materials").first();
  assert.deepEqual(savedReference, { user_id: "telegram:70001", chat_id: MOCK_CHAT_ID, message_id: 101, personal_note: "Իմ օրինակ խաղաղություն նշումը" });
  const saveDescription = await mf.dispatchFetch("https://app.fixture/saved", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://app.fixture", cookie },
    body: new URLSearchParams({ intent: "save", materialId: "material_tg_n100900_102", personalNote: "Նկարագրություն՝ իմ անձնական նշումից" }),
  });
  assert.equal(saveDescription.status, 200);

  const userBSession = await mf.dispatchFetch("https://app.fixture/telegram/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.fixture" },
    body: JSON.stringify({ initData: telegramInitData({ id: 70002, first_name: "Second", last_name: "User" }) }),
  });
  const userBCookie = (userBSession.headers.get("set-cookie") ?? "").split(";", 1)[0];
  const userBSave = await mf.dispatchFetch("https://app.fixture/saved", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://app.fixture", cookie: userBCookie },
    body: new URLSearchParams({ intent: "save", materialId: "material_tg_n100900_102", personalNote: "Օրինակ երկրորդ անձնական նշում" }),
  });
  assert.equal(userBSave.status, 200);

  const authenticatedNoteSearch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("օրինակ")}`,
    { headers: { cookie } },
  );
  const authenticatedNoteHtml = await authenticatedNoteSearch.text();
  assert.equal(authenticatedNoteSearch.status, 200);
  assert.match(authenticatedNoteHtml, /Իմ նշումներից/u);
  assert.match(authenticatedNoteHtml, /Իմ նշումից/u);
  assert.match(authenticatedNoteHtml, /data-material-id="material_tg_n100900_101"/u);
  assert.doesNotMatch(authenticatedNoteHtml, /data-material-id="material_tg_n100900_102"/u);

  const mergedDescription = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("Նկարագրություն")}`,
    { headers: { cookie } },
  );
  const mergedDescriptionHtml = await mergedDescription.text();
  assert.equal((mergedDescriptionHtml.match(/data-material-id="material_tg_n100900_102"/gu) ?? []).length, 1);
  assert.match(mergedDescriptionHtml, /Որոնման արդյունքներ/u);
  assert.match(mergedDescriptionHtml, /Իմ նշումից/u);
  // The snippet label says where a match is; per-field "matched in…" badges are no longer shown.
  assert.doesNotMatch(mergedDescriptionHtml, /Համընկնում՝ նկարագրության մեջ/u);

  const guestNoteSearch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("օրինակ")}`,
  );
  const guestNoteHtml = await guestNoteSearch.text();
  assert.doesNotMatch(guestNoteHtml, /Իմ նշումներից|Իմ նշումից|data-material-id="material_tg_n100900_101"/u);

  const duplicateSearch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("խաղաղություն")}`,
    { headers: { cookie } },
  );
  const duplicateSearchHtml = await duplicateSearch.text();
  assert.equal((duplicateSearchHtml.match(/data-material-id="material_tg_n100900_101"/gu) ?? []).length, 1);
  assert.match(duplicateSearchHtml, /Որոնման արդյունքներ/u);
  assert.match(duplicateSearchHtml, /Իմ նշումից/u);
  assert.ok(
    bridgeRequestPaths.every((path) => !decodeURIComponent(path).includes("Իմ օրինակ խաղաղություն նշումը") &&
      !decodeURIComponent(path).includes("Նկարագրություն՝ իմ անձնական նշումից") &&
      !decodeURIComponent(path).includes("Օրինակ երկրորդ անձնական նշում")),
    "personal note text must never be sent to the Telegram Bridge",
  );

  await database.prepare(
    "INSERT INTO saved_materials (user_id,chat_id,message_id,personal_note) VALUES ('telegram:70001',?,999,'Հին նշում')",
  ).bind(MOCK_CHAT_ID).run();
  // Legacy rows stored the chat ID without its -100 prefix; they must not break the page.
  await database.prepare(
    "INSERT INTO saved_materials (user_id,chat_id,message_id,personal_note) VALUES ('telegram:70001','900',998,'')",
  ).run();
  const savedPage = await mf.dispatchFetch("https://app.fixture/saved", { headers: { cookie } });
  const savedHtml = await savedPage.text();
  assert.equal(savedPage.status, 200, savedHtml.slice(0, 300));
  assert.match(savedHtml, /Առավոտյան աղոթք/u);
  assert.match(savedHtml, /Հրապարակումն այլևս հասանելի չէ/u);
  const unavailableNoteSearch = await mf.dispatchFetch(
    `https://app.fixture/search?q=${encodeURIComponent("Հին նշում")}`,
    { headers: { cookie } },
  );
  const unavailableNoteHtml = await unavailableNoteSearch.text();
  assert.match(unavailableNoteHtml, /Հրապարակումն այլևս հասանելի չէ/u);
  assert.match(unavailableNoteHtml, /Իմ նշումից/u);

  const analyticsColumns = await database.prepare("PRAGMA table_info(search_query_aggregates)").all<{ name: string }>();
  assert.ok(analyticsColumns.results.some((column: { name: string }) => column.name === "query_hash"));
  assert.ok(!analyticsColumns.results.some((column: { name: string }) => /query_text|user_id|ip_address/u.test(column.name)));
  const analytics = await database.prepare(
    "SELECT query_hash, query_count, zero_result_count FROM search_query_aggregates LIMIT 100",
  ).all<{ query_hash: string; query_count: number; zero_result_count: number }>();
  assert.ok(analytics.results.length > 0);
  assert.ok(analytics.results.every((row: { query_hash: string; query_count: number; zero_result_count: number }) =>
    /^[a-f0-9]{64}$/u.test(row.query_hash) && row.query_count > 0 && row.zero_result_count >= 0));

  const bulkSearchRows = Array.from({ length: 120 }, (_, index) => {
    const messageId = 10_000 + index;
    const marker = index === 119 ? "եզակի մեծ որոնման նշիչ" : `լրացուցիչ նյութ ${index}`;
    const normalized = normalizeTelegramSearchText(marker);
    return [database.prepare(
      `INSERT INTO library_materials
       (chat_id,message_id,material_id,topic_key,topic_id,constituent_message_ids_json,content_type,title,
        telegram_url,content_text,caption_text,formatted_text_json,formatted_caption_json,tags_json,
        content_hash,source_revision,sync_state,synced_at)
       VALUES (?,?,?,?,?,'[]','text',?,?,?,'','{"text":"","entities":[]}','{"text":"","entities":[]}','[]',?,?,'ready',?)`,
    ).bind(MOCK_CHAT_ID, messageId, `bulk-material-${messageId}`, MOCK_TOPIC_ID, 700, marker,
      `https://t.me/c/fixture/${messageId}`, marker, "b".repeat(64), String(messageId), new Date().toISOString()),
    database.prepare(
      `INSERT INTO library_search_documents
       (chat_id,message_id,field_id,ordinal,field_kind,original_text,normalized_text,aliases_text,is_primary)
       VALUES (?,?,'title-0',0,'title',?,?,?,1)`,
    ).bind(MOCK_CHAT_ID, messageId, marker, normalized, searchAliases(marker).join(" ")),
    database.prepare(
      "INSERT INTO library_search_fts(chat_id,message_id,field_id,normalized_text,aliases_text) VALUES (?,?,'title-0',?,?)",
    ).bind(MOCK_CHAT_ID, messageId, normalized, searchAliases(marker).join(" "))];
  }).flat();
  await database.batch(bulkSearchRows);
  const largeSearch = await mf.dispatchFetch(
    `https://app.fixture/api/search-page?q=${encodeURIComponent("եզակի մեծ որոնման նշիչ")}`,
  );
  assert.equal(largeSearch.status, 200, "global search hydration must stay below D1 expression-depth limits");
  const largeSearchData = await largeSearch.json() as { materials: Array<{ id: string }> };
  assert.ok(largeSearchData.materials.some((material) => material.id === "bulk-material-10119"));
  assert.equal(bridgeRequestPaths.length, 0, "normal public reads must not call Telegram Bridge");
});

test("production-like SSR bursts isolate client aborts without hanging healthy requests", async (context) => {
  const adapter = new MockTelegramAdapter();
  const bridge = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    operationTimeoutMs: 2_000,
  });
  const serverRoot = resolve(ROOT, "build/server");
  const serverModules = readdirSync(serverRoot, { recursive: true })
    .filter((path): path is string => typeof path === "string" && path.endsWith(".js"))
    .map((path) => ({ type: "ESModule" as const, path, contents: readFileSync(resolve(serverRoot, path), "utf8") }));
  let bridgeUnavailable = false;
  const mf = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: "bridge-worker-stress",
      compatibilityDate: "2026-10-06",
      modules: serverModules,
      d1Databases: { DB: "stress-db" },
      r2Buckets: { MEDIA: "stress-media" },
      bindings: {
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        TELEGRAM_BRIDGE_URL: "https://bridge.fixture",
        TELEGRAM_BRIDGE_SHARED_SECRET: BRIDGE_SECRET,
        TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS: "2000",
      },
      outboundService: (request: Request) => bridgeUnavailable
        ? delayedValue(new Response("late"), request.signal, 5_000)
        : bridge(request),
    }],
  } as unknown as Parameters<typeof convertV4MiniflareOptions>[0]));
  context.after(() => mf.dispose());
  const database = await mf.getD1Database("DB");
  const mediaBucket = await mf.getR2Bucket("MEDIA");
  for (const migration of readdirSync(resolve(ROOT, "migrations")).filter((name) => name.endsWith(".sql")).sort()) {
    const statements = readFileSync(resolve(ROOT, "migrations", migration), "utf8")
      .replace(/^\s*--.*$/gmu, "").split(";").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await database.prepare(statement).run();
  }
  await seedCloudLibrary(database, mediaBucket as unknown as TestR2Bucket);

  const routes = [
    "/",
    `/categories/${MOCK_TOPIC_SLUG}`,
    "/materials/material_tg_n100900_101",
    `/search?q=${encodeURIComponent("Սաղմ")}`,
  ];
  let completed = 0;
  let intentionalAborts = 0;
  for (let burst = 0; burst < 3; burst += 1) {
    const controllers = Array.from({ length: 50 }, () => new AbortController());
    const pending = controllers.map(async (controller, index) => {
      try {
        const response = await mf.dispatchFetch("https://app.fixture/", {
          signal: controller.signal,
        });
        if (index >= 10) {
          assert.equal(response.status, 200);
          completed += 1;
        }
      } catch (error) {
        if (index >= 10) throw error;
      }
    });
    for (let index = 0; index < 10; index += 1) {
      controllers[index].abort(new Error("intentional stress abort"));
      intentionalAborts += 1;
    }
    await Promise.all(pending);
    const mixed = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      mf.dispatchFetch(`https://app.fixture${routes[index % routes.length]}`)
    ));
    assert.ok(mixed.every((response) => response.status === 200));
    completed += mixed.length;
  }
  assert.equal(completed, 210);
  assert.equal(intentionalAborts, 30);
  assert.equal((await bridge(bridgeRequest("/health"))).status, 200);
  assert.equal((await bridge(bridgeRequest("/ready"))).status, 200);
  assert.deepEqual(readBridgeApplicationState(bridge), { activeMediaSlots: 0, queuedMediaRequests: 0, inflightOperations: 0 });
  bridgeUnavailable = true;
  const unavailableStartedAt = performance.now();
  const unavailable = await mf.dispatchFetch("https://app.fixture/?refresh=1");
  assert.equal(unavailable.status, 200, "public SSR must remain available when the sync Bridge is down");
  assert.ok(performance.now() - unavailableStartedAt < 3_000, "cloud-only SSR must not wait for the Bridge");
});
