import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { readTelegramBridgeConfiguration } from "../app/data/telegram-bridge-config.server";
import { isPendingNavigation } from "../shared/navigation-state";
import { createBridgeApplication } from "../services/telegram-bridge/src/app";
import { teleprotoDownloadParameters } from "../services/telegram-bridge/src/gramjs-adapter";
import { TelegramSearchIndex } from "../services/telegram-bridge/src/search-index";
import { classifyPost } from "../services/telegram-bridge/src/category-mapping";
import { activeContentChatIds, readBridgeConfig } from "../services/telegram-bridge/src/config";
import { MockTelegramAdapter, MOCK_CHAT_ID, MOCK_TELEGRAM_POSTS, MOCK_VIDEO_SIZE } from "../services/telegram-bridge/src/mock-adapter";
import { createTopicCategoryId, createTopicSlug, isBridgeSearchHit, type BridgeCategoryMappings, type BridgePostPage } from "../shared/telegram-bridge-contract";
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

test("Teleproto media plan uses byte limits and preserves the source DC", () => {
  const plan = teleprotoDownloadParameters(100, 700_099, 4);
  assert.equal(plan.limit, 700_000);
  assert.equal(plan.requestSize, 512 * 1024);
  assert.equal(plan.offset.toString(), "100");
  assert.equal(plan.dcId, 4);
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
    ["Բացատ", 108, "transliteration"],
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
  const multiChunk = await app(bridgeRequest(`/media/${MOCK_CHAT_ID}/106/0`, { headers: { range: "bytes=0-614399" } }));
  assert.equal(multiChunk.status, 206);
  assert.equal((await multiChunk.arrayBuffer()).byteLength, 614_400);
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

test("pending navigation, media failure isolation, and metadata abort remain safe", async () => {
  assert.equal(isPendingNavigation("loading", "/materials/example", "/materials/example"), true);
  assert.equal(isPendingNavigation("idle", undefined, "/materials/example"), false);

  const mediaSource = readFileSync(resolve(ROOT, "app/components/material-media.tsx"), "utf8");
  const resultCardSource = readFileSync(resolve(ROOT, "app/components/material-result-card.tsx"), "utf8");
  const materialRouteSource = readFileSync(resolve(ROOT, "app/routes/material.tsx"), "utf8");
  const richRendererSource = readFileSync(resolve(ROOT, "app/components/telegram-content.tsx"), "utf8");
  const bridgeAppSource = readFileSync(resolve(ROOT, "services/telegram-bridge/src/app.ts"), "utf8");
  const bridgeServerSource = readFileSync(resolve(ROOT, "services/telegram-bridge/src/server.ts"), "utf8");
  assert.match(mediaSource, /onError=\{\(\) => setFailed\(true\)\}/u);
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

test("Bridge flows through Worker loaders, SSR, bookmark references and media proxy", async (context) => {
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
  for (const label of ["Տեքստ", "Նկար", "2 նկար", "Տեսանյութ", "Հարցում", "Տեղադրություն", "Այլ նյութ"]) {
    assert.match(categoryHtml, new RegExp(label, "u"));
  }
  assert.match(categoryHtml, /loading="lazy"/u);
  assert.match(categoryHtml, /thumbnail=1/u);
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
  assert.match(await guestSaved.text(), /Անձնական բաժինը հասանելի է Telegram Mini App-ից բացելիս/u);

  const imagePage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_102");
  const imageHtml = await imagePage.text();
  assert.equal(imagePage.status, 200);
  assert.match(imageHtml, /<img/u);
  assert.match(imageHtml, /<img[^>]+thumbnail=1/u);
  const richPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_112");
  const richHtml = await richPage.text();
  assert.match(richHtml, /<h2[^>]*>Ձևաչափված ընթերցում<\/h2>/u);
  assert.match(richHtml, /<strong>Թավ տեքստ<\/strong>/u);
  assert.match(richHtml, /<blockquote/u);
  assert.match(richHtml, /Նկարի բացատրություն/u);
  assert.doesNotMatch(richHtml, /dangerouslySetInnerHTML|javascript:/u);
  const formattedPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_101");
  assert.match(await formattedPage.text(), /<strong>Տե՛ր<\/strong>/u);
  const videoPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_106");
  const videoHtml = await videoPage.text();
  assert.match(videoHtml, /<video/u);
  assert.match(videoHtml, /thumbnail=1/u);
  const pollPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_109");
  const pollHtml = await pollPage.text();
  assert.match(pollHtml, /Քվեարկել Telegram-ում/u);
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
  assert.equal(proxiedHead.headers.get("content-length"), String(MOCK_VIDEO_SIZE));
  assert.equal((await mf.dispatchFetch("https://app.fixture/media/-100999/106/0")).status, 404);

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
  assert.match(topicMatchHtml, /Նյութի տեքստից/u);
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
  assert.match(mergedDescriptionHtml, /Telegram նյութ/u);
  assert.match(mergedDescriptionHtml, /Իմ նշումից/u);
  assert.match(mergedDescriptionHtml, /Համընկնում՝ նկարագրության մեջ/u);

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
  assert.match(duplicateSearchHtml, /Telegram նյութ/u);
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
  const savedPage = await mf.dispatchFetch("https://app.fixture/saved", { headers: { cookie } });
  const savedHtml = await savedPage.text();
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
});
