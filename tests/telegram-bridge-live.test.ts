import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeApplication } from "../services/telegram-bridge/src/app";
import { activeContentChatIds, readBridgeConfig } from "../services/telegram-bridge/src/config";
import { GramJsTelegramAdapter } from "../services/telegram-bridge/src/gramjs-adapter";
import type { BridgeCategory, BridgePost, BridgePostPage } from "../shared/telegram-bridge-contract";

const live = process.env.TELEGRAM_LIVE_TEST === "1";
const TEST_FIXTURE_CHAT_ID = "-1004427053230";

test("authorized Teleproto session serves the allowlisted forum end to end", { skip: !live, timeout: 120_000 }, async (context) => {
  const config = readBridgeConfig(process.env);
  assert.equal(config.adapter, "gramjs");
  const contentChatIds = activeContentChatIds(config);
  assert.equal(contentChatIds.length, 1, "Live verification must use exactly one active content source.");
  const chatId = contentChatIds[0];
  const adapter = new GramJsTelegramAdapter({
    apiId: config.apiId!,
    apiHash: config.apiHash!,
    session: config.session!,
    allowedChatIds: contentChatIds,
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
    allowedChatIds: new Set(contentChatIds),
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
  const pagesByTopic = new Map<number, BridgePost[][]>();
  const firstCursorByTopic = new Map<number, string>();
  for (const topic of topics) {
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await app(request(`/categories/${topic.slug}/posts${suffix}`));
      assert.equal(response.status, 200);
      const page = await response.json() as BridgePostPage;
      assert.ok(page.posts.length <= 12, `Topic ${topic.topicId} exceeded the 12-material page contract.`);
      const topicPages = pagesByTopic.get(topic.topicId!) ?? [];
      topicPages.push(page.posts);
      pagesByTopic.set(topic.topicId!, topicPages);
      if (pageNumber === 0 && page.nextCursor) firstCursorByTopic.set(topic.topicId!, page.nextCursor);
      posts.push(...page.posts);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
  }
  const uniquePosts = [...new Map(posts.map((post) => [post.id, post])).values()];
  if (chatId !== TEST_FIXTURE_CHAT_ID) {
    const visibleTopics = topics.filter((topic) => !topic.isGeneral && topic.topicId !== 1);
    assert.equal(visibleTopics.length, 6, "The active main forum should expose six visible content topics.");
    assert.ok(uniquePosts.length > 0, "The active main forum should expose readable materials.");
    assert.ok(uniquePosts.every((post) => post.chatId === chatId), "No material may leak from another allowlisted forum.");
    const materialMessageIds = new Set(uniquePosts.map((post) => post.messageId));
    for (const album of uniquePosts.filter((post) => post.contentType === "album" && post.mediaGroupId)) {
      assert.ok(album.constituentMessageIds.length > 1);
      assert.ok(
        album.constituentMessageIds.filter((messageId) => messageId !== album.messageId)
          .every((messageId) => !materialMessageIds.has(messageId)),
        `Album ${album.messageId} must stay canonical across cursor boundaries.`,
      );
    }

    for (const richTopicId of [136, 205]) {
      const topicPosts = (pagesByTopic.get(richTopicId) ?? []).flat();
      const expectedCount = richTopicId === 136 ? 5 : 42;
      assert.equal(topicPosts.length, expectedCount, `Topic ${richTopicId} must expose every RichMessage through cursors.`);
      assert.equal(new Set(topicPosts.map((post) => post.id)).size, expectedCount, `Topic ${richTopicId} pages must remain unique.`);
      assert.ok(topicPosts.every((post) => post.contentType !== "unsupported"), `Topic ${richTopicId} must not degrade to MessageMediaUnsupported.`);
      assert.ok(topicPosts.every((post) => post.contentText.length > 0), `Topic ${richTopicId} must preserve searchable plain text.`);
      assert.ok(topicPosts.every((post) => post.richContent === null), `Topic ${richTopicId} feed must omit full rich block payloads.`);
      const richDetail = await app(request(`/posts/${chatId}/${topicPosts[0]!.messageId}`));
      assert.equal(richDetail.status, 200);
      assert.ok((await richDetail.json() as BridgePost).richContent?.blocks.length, `Topic ${richTopicId} detail must expose decoded rich blocks.`);
    }

    const topic205 = topics.find((topic) => topic.topicId === 205)!;
    const topic136 = topics.find((topic) => topic.topicId === 136)!;
    const topic205Cursor = firstCursorByTopic.get(205);
    assert.ok(topic205Cursor, "Topic 205 must expose a second cursor page.");
    assert.equal((await app(request(`/categories/${topic136.slug}/posts?cursor=${encodeURIComponent(topic205Cursor)}`))).status, 400);
    const tamperedCursor = `${topic205Cursor.slice(0, -1)}${topic205Cursor.endsWith("A") ? "B" : "A"}`;
    assert.equal((await app(request(`/categories/${topic205.slug}/posts?cursor=${encodeURIComponent(tamperedCursor)}`))).status, 400);

    const topic205Posts = (pagesByTopic.get(205) ?? []).flat();
    const beyondFirstPage = topic205Posts[12];
    assert.ok(beyondFirstPage, "Topic 205 must have a material beyond its initial page.");
    const beyondQuery = beyondFirstPage.title.trim();
    assert.ok(Array.from(beyondQuery).length >= 2);
    const beyondSearch = await app(request(
      `/search?q=${encodeURIComponent(beyondQuery)}&category=${encodeURIComponent(topic205.id)}`,
    ));
    assert.equal(beyondSearch.status, 200);
    assert.ok((await beyondSearch.json() as BridgePostPage).posts.some((post) => post.id === beyondFirstPage.id));

    const text = uniquePosts.find((post) => post.contentType === "text");
    const poll = uniquePosts.find((post) => post.contentType === "poll" && post.poll?.options.length);
    const audio = uniquePosts.find((post) => post.contentType === "audio");
    const video = uniquePosts.find((post) => post.contentType === "video");
    assert.ok(text, "The main forum should expose a text material.");
    assert.ok(poll, "The main forum should expose a poll material.");
    assert.ok(audio, "The main forum should expose an audio material.");
    assert.ok(video, "The main forum should expose a video material.");
    const pollData = poll.poll;
    assert.ok(pollData);
    assert.doesNotMatch(JSON.stringify(pollData), /chosen|correct|explanation|solution/iu);

    const detail = await app(request(`/posts/${chatId}/${text.messageId}`));
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as BridgePost).messageId, text.messageId);
    const unavailable = await app(request(`/posts/${chatId}/2147483647`));
    assert.equal(unavailable.status, 404);
    const testForumDenied = await app(request(`/posts/${TEST_FIXTURE_CHAT_ID}/1`));
    assert.equal(testForumDenied.status, 404);

    const idSearch = await app(request(`/search?q=${encodeURIComponent(`#${video.messageId}`)}`));
    assert.equal(idSearch.status, 200);
    assert.ok((await idSearch.json() as BridgePostPage).posts.some((post) => post.messageId === video.messageId));
    for (const query of ["Սաղմոս", "Սաղմ", "saxmos"]) {
      const search = await app(request(`/search?q=${encodeURIComponent(query)}`));
      assert.equal(search.status, 200);
      assert.ok((await search.json() as BridgePostPage).posts.length > 0, `${query} should find a main-forum material.`);
    }

    const pollQuestionSearch = await app(request(`/search?q=${encodeURIComponent(pollData.question.text)}`));
    assert.equal(pollQuestionSearch.status, 200);
    assert.ok((await pollQuestionSearch.json() as BridgePostPage).posts.some((post) => post.messageId === poll.messageId));
    const pollOption = pollData.options.find((option) => Array.from(option.text.text.trim()).length >= 2);
    assert.ok(pollOption);
    const pollOptionSearch = await app(request(`/search?q=${encodeURIComponent(pollOption.text.text)}`));
    assert.equal(pollOptionSearch.status, 200);
    assert.ok((await pollOptionSearch.json() as BridgePostPage).posts.some((post) => post.messageId === poll.messageId));

    const rangeCheck = async (post: BridgePost, mediaIndex = 0, length = 64) => {
      const descriptor = post.media[mediaIndex];
      assert.ok(descriptor?.sizeBytes && descriptor.sizeBytes > 64);
      const head = await app(request(`/media/${chatId}/${post.messageId}/${mediaIndex}`, { method: "HEAD" }));
      assert.equal(head.status, 200);
      assert.equal(head.headers.get("accept-ranges"), "bytes");
      const safeLength = Math.min(length, descriptor.sizeBytes!);
      const range = await app(request(`/media/${chatId}/${post.messageId}/${mediaIndex}`, { headers: { range: `bytes=0-${safeLength - 1}` } }));
      assert.equal(range.status, 206);
      assert.equal((await range.arrayBuffer()).byteLength, safeLength);
      const invalid = await app(request(`/media/${chatId}/${post.messageId}/${mediaIndex}`, { headers: { range: `bytes=${descriptor.sizeBytes}-` } }));
      assert.equal(invalid.status, 416);
    };
    await rangeCheck(audio, 0, 614_400);
    await rangeCheck(video, 0, 614_400);
    const richPhoto = uniquePosts.find((post) => (post.topicId === 136 || post.topicId === 205) && post.media.some((media) => media.kind === "photo"));
    assert.ok(richPhoto, "A RichMessage photo must be available for streaming verification.");
    await rangeCheck(richPhoto, richPhoto.media.findIndex((media) => media.kind === "photo"));
    const album = uniquePosts.find((post) => post.contentType === "album" && post.media.length > 1);
    if (album) await rangeCheck(album, 1);
    const document = uniquePosts.find((post) => post.media.some((media) => media.kind === "document"));
    if (document) await rangeCheck(document, document.media.findIndex((media) => media.kind === "document"));
    assert.deepEqual(await (await app(request("/ready"))).json(), { ready: true });

    const unmatchedQuery = "չհամընկնողեզակիբառաշար";
    const topicNoMatch = await app(request(
      `/search?q=${encodeURIComponent(unmatchedQuery)}&category=${encodeURIComponent(visibleTopics[0].id)}`,
    ));
    assert.equal(topicNoMatch.status, 200);
    assert.equal((await topicNoMatch.json() as BridgePostPage).posts.length, 0);
    const globalNoMatch = await app(request(`/search?q=${encodeURIComponent(unmatchedQuery)}`));
    assert.equal(globalNoMatch.status, 200);
    assert.equal((await globalNoMatch.json() as BridgePostPage).posts.length, 0);
    return;
  }
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
  const pollQuestionSearch = await app(request(`/search?q=${encodeURIComponent("կլոր")}`));
  assert.ok((await pollQuestionSearch.json() as BridgePostPage).posts.some((post) => post.messageId === 64));
  const pollOptionQuery = poll?.poll?.options.find((option) => Array.from(option.text.text.trim()).length >= 2)?.text.text;
  if (pollOptionQuery) {
    const pollOptionSearch = await app(request(`/search?q=${encodeURIComponent(pollOptionQuery)}`));
    assert.ok((await pollOptionSearch.json() as BridgePostPage).posts.some((post) => post.messageId === 64));
  }

  const album = uniquePosts.find((post) => post.contentType === "album" && post.topicId !== 1)!;
  assert.deepEqual(album.media.map((media) => media.index), album.media.map((_, index) => index));
  assert.equal(new Set(album.media.map((media) => media.index)).size, album.media.length);
  assert.ok(album.media.every((media) => media.hasThumbnail), "Album photos should expose bounded Telegram thumbnails.");
  const detail = await app(request(`/posts/${chatId}/${album.messageId}`));
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as BridgePost).mediaGroupId, album.mediaGroupId);
  const albumChildId = album.constituentMessageIds.find((messageId) => messageId !== album.messageId);
  if (albumChildId) {
    const childSearch = await app(request(`/search?q=${encodeURIComponent(`#${albumChildId}`)}`));
    const childPage = await childSearch.json() as BridgePostPage;
    assert.ok(
      childPage.posts.some((post) => post.messageId === album.messageId),
      `Album child ${albumChildId} should resolve to canonical ${album.messageId}; returned IDs: ${childPage.posts.map((post) => post.messageId).join(",") || "none"}.`,
    );
  }

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
  const liveSearchCases = [
    ["#67", 67],
    ["id:67", 67],
    ["Bacat", 68],
    ["Bacar", 68],
    ["Բացատ", 68],
    ["saxmos", 66],
  ] as const;
  for (const [query, messageId] of liveSearchCases) {
    const response = await app(request(`/search?q=${encodeURIComponent(query)}`));
    assert.equal(response.status, 200);
    assert.ok((await response.json() as BridgePostPage).posts.some((post) => post.messageId === messageId), `${query} should find ${messageId}`);
  }
  const descriptionSearch = await app(request(`/search?q=${encodeURIComponent("Նկարագրություն")}`));
  assert.ok((await descriptionSearch.json() as BridgePostPage).posts.length > 0);
  const unrelatedSearch = await app(request(`/search?q=${encodeURIComponent("բոլորովինանհամապատասխանբառ")}`));
  assert.equal((await unrelatedSearch.json() as BridgePostPage).posts.length, 0);

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
