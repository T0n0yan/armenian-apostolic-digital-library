import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { createBridgeApplication } from "../services/telegram-bridge/src/app";
import { classifyPost } from "../services/telegram-bridge/src/category-mapping";
import { MockTelegramAdapter, MOCK_CHAT_ID, MOCK_TELEGRAM_POSTS, MOCK_VIDEO_SIZE } from "../services/telegram-bridge/src/mock-adapter";
import { createTopicCategoryId, createTopicSlug, type BridgeCategoryMappings, type BridgePostPage } from "../shared/telegram-bridge-contract";

const ROOT = resolve(import.meta.dirname, "..");
const BRIDGE_SECRET = "fixture_bridge_secret_000000000000000000";
const BOT_TOKEN = "000000000:fixture-token-not-a-secret";
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

test("mock adapter and authenticated Bridge API cover pagination, search, posts and streaming", async () => {
  const adapter = new MockTelegramAdapter();
  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set([MOCK_CHAT_ID]),
    sharedSecret: BRIDGE_SECRET,
    mediaConcurrency: 1,
  });

  const conflictingMappings: BridgeCategoryMappings = {
    topics: { [`${MOCK_CHAT_ID}:700`]: "category_prayers" },
    hashtags: { "աղոթք": "category_saints_lives" },
    posts: { [`${MOCK_CHAT_ID}:101`]: "category_gospel_teachings" },
  };
  assert.equal(classifyPost(MOCK_TELEGRAM_POSTS.at(-1)!, conflictingMappings).categoryId, "category_prayers");
  assert.equal(classifyPost({ ...MOCK_TELEGRAM_POSTS.at(-1)!, forumTopicId: null }, conflictingMappings).categoryId, "category_saints_lives");
  assert.equal(classifyPost({ ...MOCK_TELEGRAM_POSTS.at(-1)!, forumTopicId: null, tags: [] }, conflictingMappings).categoryId, "category_gospel_teachings");

  const first = await adapter.listHistory({ cursor: null, limit: 2, signal: new AbortController().signal });
  assert.equal(first.posts.length, 2);
  assert.ok(first.nextCursor);
  const second = await adapter.listHistory({ cursor: first.nextCursor, limit: 2, signal: new AbortController().signal });
  assert.equal(second.posts.length, 2);
  assert.notEqual(second.posts[0].messageId, first.posts[0].messageId);

  const categories = await (await app(bridgeRequest("/categories"))).json() as Array<{ id: string; materialCount: number }>;
  assert.equal(categories.find((item) => item.id === MOCK_TOPIC_ID)?.materialCount, 9);
  const page = await (await app(bridgeRequest(`/categories/${MOCK_TOPIC_SLUG}/posts`))).json() as BridgePostPage;
  assert.ok(page.posts.some((post) => post.messageId === 101 && post.contentText.includes("խաղաղություն")));
  assert.equal(page.posts.find((post) => post.messageId === 102)?.media[0].kind, "photo");
  assert.deepEqual(page.posts.find((post) => post.messageId === 103)?.media.map((asset) => asset.index), [0, 1]);
  assert.ok(page.posts.find((post) => post.messageId === 104)?.editedAt);
  assert.equal(page.posts.find((post) => post.messageId === 109)?.poll?.totalVoters, 8);
  assert.equal(page.posts.find((post) => post.messageId === 108)?.location?.venueType, "church");
  assert.equal(page.posts.find((post) => post.messageId === 110)?.contentType, "unsupported");

  const deleted = await app(bridgeRequest(`/posts/${MOCK_CHAT_ID}/105`));
  assert.equal(deleted.status, 410);
  const search = await (await app(bridgeRequest("/search?q=%D5%AD%D5%A1%D5%B2%D5%A1%D5%B2%D5%B8%D6%82%D5%A9%D5%B5%D5%B8%D6%82%D5%B6"))).json() as BridgePostPage;
  assert.ok(search.posts.length >= 1);

  const unauthorized = await app(new Request("https://bridge.fixture/categories"));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /fixture_bridge_secret/u);
  assert.equal((await app(bridgeRequest("/posts/-100999/101"))).status, 404);

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
});

test("Bridge flows through Worker loaders, SSR, bookmark references and media proxy", async (context) => {
  const adapter = new MockTelegramAdapter();
  const bridge = createBridgeApplication({ adapter, allowedChatIds: new Set([MOCK_CHAT_ID]), sharedSecret: BRIDGE_SECRET });
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
      },
      outboundService: (request: Request) => bridge(request),
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
  assert.match(await home.text(), /Աղոթքներ/u);
  const category = await mf.dispatchFetch(`https://app.fixture/categories/${MOCK_TOPIC_SLUG}`);
  assert.match(await category.text(), /Առավոտյան աղոթք/u);

  const imagePage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_102");
  const imageHtml = await imagePage.text();
  assert.equal(imagePage.status, 200);
  assert.match(imageHtml, /<img/u);
  assert.match(imageHtml, /\/media\/-100900\/102\/0/u);
  const formattedPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_101");
  assert.match(await formattedPage.text(), /<strong>Տե՛ր<\/strong>/u);
  const videoPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_106");
  const videoHtml = await videoPage.text();
  assert.match(videoHtml, /<video/u);
  assert.match(videoHtml, /thumbnail=1/u);
  const pollPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_109");
  const pollHtml = await pollPage.text();
  assert.match(pollHtml, /Քվեարկել Telegram-ում/u);
  assert.match(pollHtml, /Ընտրված պատասխան/u);
  const locationPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_108");
  assert.match(await locationPage.text(), /Բացել քարտեզում/u);
  const unsupportedPage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_110");
  assert.match(await unsupportedPage.text(), /MessageMediaUnsupported/u);
  const voicePage = await mf.dispatchFetch("https://app.fixture/materials/material_tg_n100900_107");
  assert.match(await voicePage.text(), /<audio/u);
  assert.doesNotMatch(`${imageHtml}${videoHtml}`, /fixture_bridge_secret|TELEGRAM_SESSION|TELEGRAM_API_HASH/u);

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
    body: new URLSearchParams({ intent: "save", materialId: "material_tg_n100900_101", personalNote: "Իմ նշումը" }),
  });
  assert.equal(save.status, 200);
  const savedReference = await database.prepare("SELECT user_id,chat_id,message_id,personal_note FROM saved_materials").first();
  assert.deepEqual(savedReference, { user_id: "telegram:70001", chat_id: MOCK_CHAT_ID, message_id: 101, personal_note: "Իմ նշումը" });
  await database.prepare(
    "INSERT INTO saved_materials (user_id,chat_id,message_id,personal_note) VALUES ('telegram:70001',?,999,'Հին նշում')",
  ).bind(MOCK_CHAT_ID).run();
  const savedPage = await mf.dispatchFetch("https://app.fixture/saved", { headers: { cookie } });
  const savedHtml = await savedPage.text();
  assert.match(savedHtml, /Առավոտյան աղոթք/u);
  assert.match(savedHtml, /Հրապարակումն այլևս հասանելի չէ/u);
});
