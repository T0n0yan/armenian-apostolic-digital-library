import assert from "node:assert/strict";
import test from "node:test";

import { kindOf, materialIdOf, readStorageBreakdown, topPrefix } from "../app/data/storage-breakdown.server";

test("topPrefix", () => {
  assert.equal(topPrefix("library/1/a.jpg"), "library");
  assert.equal(topPrefix("file.txt"), "(արմատ)");
});

test("խմբավորում է ըստ թղթապանակի, էջ առ էջ", async () => {
  const pages = [
    { objects: [{ key: "a/1", size: 10 }, { key: "b/1", size: 5 }], truncated: true, cursor: "c" },
    { objects: [{ key: "a/2", size: 20 }], truncated: false },
  ];
  let call = 0;
  const bucket = { list: async () => pages[call++] } as unknown as R2Bucket;
  const result = await readStorageBreakdown(bucket);
  assert.equal(result.complete, true);
  assert.deepEqual(result.groups, [{ prefix: "a", files: 2, bytes: 30 }, { prefix: "b", files: 1, bytes: 5 }]);
  assert.equal(result.bytes, 35);
});

test("kindOf և materialIdOf", () => {
  assert.equal(kindOf("v1/-100/5/abc/0/original.mp4"), "video");
  assert.equal(kindOf("v1/-100/5/abc/0/audio.MP3"), "audio");
  assert.equal(kindOf("og/v1/x.jpg"), "image");
  assert.equal(materialIdOf("v1/-1002993860753/277/abc/0/original.mp4"), "material_tg_n1002993860753_277");
  assert.equal(materialIdOf("og/v1/x.jpg"), null);
});

test("Telegram-ի մեդիան՝ ըստ տեսակի, ամենամեծերը", async () => {
  const bucket = { list: async () => ({ objects: [{ key: "v1/-1/2/h/0/original.mp4", size: 100 }, { key: "v1/-1/3/h/0/a.mp3", size: 10 }, { key: "og/v1/a.jpg", size: 1 }], truncated: false }) } as unknown as R2Bucket;
  const result = await readStorageBreakdown(bucket);
  assert.deepEqual(result.kinds.map((item) => item.kind), ["video", "audio"]);
  assert.equal(result.largest[0].materialId, "material_tg_n1_2");
});
