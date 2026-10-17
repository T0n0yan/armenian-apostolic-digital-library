import assert from "node:assert/strict";
import test from "node:test";

import { readCloudMedia } from "../app/data/cloud-media.server";

function fixtures(objects: Record<string, Uint8Array>) {
  const database = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ r2_key: "original.mp3", thumbnail_r2_key: "thumbnail.jpg", mime_type: "audio/mpeg" }),
      }),
    }),
  } as unknown as D1Database;
  const bucket = {
    head: async (key: string) => objects[key] ? { size: objects[key].byteLength, httpEtag: `"${key}"` } : null,
    get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const bytes = objects[key];
      if (!bytes) return null;
      const body = options?.range ? bytes.slice(options.range.offset, options.range.offset + options.range.length) : bytes;
      return { size: bytes.byteLength, body: new Blob([body]).stream() };
    },
  } as unknown as R2Bucket;
  return { database, bucket };
}

const objects = { "original.mp3": new Uint8Array(100), "thumbnail.jpg": new Uint8Array(10) };

test("cloud media serves thumbnails as JPEG, not the original MIME type", async () => {
  const { database, bucket } = fixtures(objects);
  const response = await readCloudMedia(database, bucket, "-100", 1, 0, new Request("https://library.test/media/-100/1/0?thumbnail=1"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("Content-Length"), "10");
});

test("cloud media keeps the original MIME type and Range semantics", async () => {
  const { database, bucket } = fixtures(objects);
  const response = await readCloudMedia(database, bucket, "-100", 1, 0, new Request("https://library.test/media/-100/1/0", { headers: { Range: "bytes=10-" } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(response.headers.get("Content-Range"), "bytes 10-99/100");
  assert.equal((await response.arrayBuffer()).byteLength, 90);
});
