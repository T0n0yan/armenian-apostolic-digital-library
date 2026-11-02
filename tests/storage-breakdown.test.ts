import assert from "node:assert/strict";
import test from "node:test";

import { readStorageBreakdown, topPrefix } from "../app/data/storage-breakdown.server";

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
