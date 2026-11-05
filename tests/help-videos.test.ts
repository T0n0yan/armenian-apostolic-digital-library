import assert from "node:assert/strict";
import { test } from "node:test";

import { HELP_VIDEOS, helpVideoList, helpVideoUrl, isHelpVideoId } from "../app/utils/help-videos";

test("օգնության տեսանյութերի id-ները չեն կրկնվում և ապահով են հասցեի համար", () => {
  const ids = HELP_VIDEOS.map((video) => video.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/u);
  assert.equal(isHelpVideoId("voronum"), true);
  assert.equal(isHelpVideoId("../x"), false);
});

test("ցանկը՝ կարգով, համարով, միայն վերբեռնվածներն ունեն հասցե", () => {
  const list = helpVideoList({ files: { voronum: { key: "help/voronum-abc.mp4", size: 1, updatedAt: "2026-11-05" } }, onboarding: true });
  assert.equal(list.length, HELP_VIDEOS.length);
  assert.equal(list[0].number, 1);
  assert.equal(list.find((video) => video.id === "voronum")?.url, "/help-media/voronum-abc.mp4");
  assert.equal(list.filter((video) => video.url).length, 1);
  assert.equal(helpVideoUrl("help/x.mp4"), "/help-media/x.mp4");
});
