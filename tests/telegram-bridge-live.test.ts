import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeApplication } from "../services/telegram-bridge/src/app";
import { readBridgeConfig } from "../services/telegram-bridge/src/config";
import { GramJsTelegramAdapter } from "../services/telegram-bridge/src/gramjs-adapter";
import type { BridgeCategory, BridgePost, BridgePostPage } from "../shared/telegram-bridge-contract";

const live = process.env.TELEGRAM_LIVE_TEST === "1";

test("authorized GramJS session serves the allowlisted forum end to end", { skip: !live, timeout: 120_000 }, async (context) => {
  const config = readBridgeConfig(process.env);
  assert.equal(config.adapter, "gramjs");
  assert.equal(config.allowedChatIds.length, 1, "Live verification requires exactly one explicitly allowlisted test chat.");
  const chatId = config.allowedChatIds[0];
  const adapter = new GramJsTelegramAdapter({
    apiId: config.apiId!,
    apiHash: config.apiHash!,
    session: config.session!,
    allowedChatIds: config.allowedChatIds,
  });
  await adapter.connect();
  context.after(() => adapter.close());

  const signal = new AbortController().signal;
  const topics = await adapter.listTopics({ refresh: true, signal });
  assert.ok(topics.length >= 1);
  assert.ok(topics.every((topic) => topic.chatId === chatId && topic.topicId && topic.slug && topic.name));
  assert.ok(topics.some((topic) => topic.isGeneral && topic.topicId === 1));

  const app = createBridgeApplication({
    adapter,
    allowedChatIds: new Set(config.allowedChatIds),
    sharedSecret: config.sharedSecret,
    mediaConcurrency: 1,
    topicCacheTtlMs: 1_000,
  });
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${config.sharedSecret}`);
    return new Request(`http://bridge.local${path}`, { ...init, headers });
  };

  const unauthorized = await app(new Request("http://bridge.local/categories"));
  assert.equal(unauthorized.status, 401);
  assert.doesNotMatch(await unauthorized.text(), /session|secret|api[_ -]?hash/iu);
  const denied = await app(request("/posts/-1001/1"));
  assert.equal(denied.status, 404);

  const categoryResponse = await app(request("/categories?refresh=1"));
  assert.equal(categoryResponse.status, 200);
  const categories = await categoryResponse.json() as BridgeCategory[];
  assert.deepEqual(categories.map((topic) => topic.id), topics.map((topic) => topic.id));

  const posts: BridgePost[] = [];
  for (const topic of topics) {
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await app(request(`/categories/${topic.slug}/posts${suffix}`));
      assert.equal(response.status, 200);
      const page = await response.json() as BridgePostPage;
      posts.push(...page.posts);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
  }
  const uniquePosts = [...new Map(posts.map((post) => [post.id, post])).values()];
  assert.ok(uniquePosts.some((post) => post.contentType === "text"));
  assert.ok(uniquePosts.some((post) => post.contentType === "photo"));
  assert.ok(uniquePosts.some((post) => post.contentType === "album" && post.media.length > 1));
  assert.ok(uniquePosts.some((post) => post.contentType === "video"));
  assert.ok(uniquePosts.some((post) => post.contentType === "audio" || post.contentType === "voice"));
  assert.ok(uniquePosts.some((post) => post.contentType === "location" && post.location));

  const poll = uniquePosts.find((post) => post.messageId === 64);
  assert.equal(poll?.contentType, "poll");
  assert.equal(poll?.topicId, 52);
  assert.equal(poll?.poll?.options.length, 4);
  assert.equal(poll?.poll?.quiz, true);
  assert.equal(poll?.poll?.closed, false);
  assert.equal(poll?.poll?.anonymous, true);
  assert.equal(poll?.poll?.multipleChoice, false);
  assert.ok(poll?.poll?.question.text);
  assert.doesNotMatch(JSON.stringify(poll?.poll), /chosen|correct|explanation/u);
  const pollDetail = await app(request(`/posts/${chatId}/64`));
  assert.equal(pollDetail.status, 200);
  assert.equal((await pollDetail.json() as BridgePost).contentType, "poll");

  const album = uniquePosts.find((post) => post.contentType === "album")!;
  assert.deepEqual(album.media.map((media) => media.index), album.media.map((_, index) => index));
  assert.equal(new Set(album.media.map((media) => media.index)).size, album.media.length);
  assert.ok(album.media.every((media) => media.hasThumbnail), "Album photos should expose bounded Telegram thumbnails.");
  const detail = await app(request(`/posts/${chatId}/${album.messageId}`));
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as BridgePost).mediaGroupId, album.mediaGroupId);

  const video = uniquePosts.find((post) => post.contentType === "video")!;
  const descriptor = video.media[0];
  assert.ok(descriptor.sizeBytes && descriptor.sizeBytes > 2_048);
  const head = await app(request(`/media/${chatId}/${video.messageId}/0`, { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  const firstRange = await app(request(`/media/${chatId}/${video.messageId}/0`, { headers: { range: "bytes=0-1023" } }));
  assert.equal(firstRange.status, 206);
  assert.equal((await firstRange.arrayBuffer()).byteLength, 1_024);
  const seekStart = Math.min(1_048_576, descriptor.sizeBytes! - 1_024);
  const seek = await app(request(`/media/${chatId}/${video.messageId}/0`, { headers: { range: `bytes=${seekStart}-${seekStart + 1_023}` } }));
  assert.equal(seek.status, 206);
  assert.equal((await seek.arrayBuffer()).byteLength, 1_024);
  const invalid = await app(request(`/media/${chatId}/${video.messageId}/0`, { headers: { range: `bytes=${descriptor.sizeBytes}-` } }));
  assert.equal(invalid.status, 416);
  if (descriptor.hasThumbnail) {
    const thumbnailHead = await app(request(`/media/${chatId}/${video.messageId}/0?thumbnail=1`, { method: "HEAD" }));
    assert.equal(thumbnailHead.status, 200);
    assert.equal(thumbnailHead.headers.get("content-type"), "image/jpeg");
    const thumbnailRange = await app(request(`/media/${chatId}/${video.messageId}/0?thumbnail=1`, { headers: { range: "bytes=0-63" } }));
    assert.equal(thumbnailRange.status, 206);
    assert.equal((await thumbnailRange.arrayBuffer()).byteLength, 64);
  }

  const audio = uniquePosts.find((post) => post.contentType === "audio" || post.contentType === "voice")!;
  assert.equal(audio.messageId, 66);
  assert.equal(audio.contentType, "audio");
  assert.equal(audio.media[0]?.title, "Սաղմոս 12");
  assert.ok(audio.media[0]?.duration && audio.media[0].duration > 0);
  assert.equal(audio.media[0]?.hasThumbnail, true);
  const audioRange = await app(request(`/media/${chatId}/${audio.messageId}/0`, { headers: { range: "bytes=0-511" } }));
  assert.equal(audioRange.status, 206);
  assert.equal((await audioRange.arrayBuffer()).byteLength, 512);
  const audioThumbnail = await app(request(`/media/${chatId}/${audio.messageId}/0?thumbnail=1`, { method: "HEAD" }));
  assert.equal(audioThumbnail.status, 200);
  assert.equal(audioThumbnail.headers.get("content-type"), "image/jpeg");

  for (const query of ["Սաղմ", "Սաղմոս", "սաղմ", "  Սաղմ  ", "Սաղմ,"]) {
    const search = await app(request(`/search?q=${encodeURIComponent(query)}`));
    assert.equal(search.status, 200);
    assert.ok((await search.json() as BridgePostPage).posts.some((post) => post.messageId === 66));
  }

  const topicThree = topics.find((topic) => topic.topicId === 50);
  assert.ok(topicThree, "The read-only test fixture must expose Topic 3.");
  const topicNoMatch = await app(request(
    `/search?q=${encodeURIComponent("օրինակ")}&category=${encodeURIComponent(topicThree.id)}`,
  ));
  assert.equal(topicNoMatch.status, 200);
  assert.equal((await topicNoMatch.json() as BridgePostPage).posts.length, 0);
  const globalNoMatch = await app(request(`/search?q=${encodeURIComponent("օրինակ")}`));
  assert.equal(globalNoMatch.status, 200);
  assert.equal((await globalNoMatch.json() as BridgePostPage).posts.length, 0);
});
