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
      return { size: bytes.byteLength, body: new Blob([Uint8Array.from(body)]).stream() };
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

function photoFixtures(objects: Record<string, Uint8Array>) {
  const { bucket } = fixtures(objects);
  const database = {
    prepare: () => ({ bind: () => ({ first: async () => ({ r2_key: "v1/photo/original.jpg", thumbnail_r2_key: null, mime_type: "image/jpeg" }) }) }),
  } as unknown as D1Database;
  const stored: Record<string, number> = {};
  (bucket as unknown as { put: (key: string, bytes: ArrayBuffer) => Promise<void> }).put = async (key, bytes) => { stored[key] = bytes.byteLength; };
  return { database, bucket, stored };
}

function fakeImages(size: number, calls: { count: number }) {
  return {
    input: () => ({ transform: () => ({ output: async () => { calls.count += 1; return { response: () => new Response(new Uint8Array(size)) }; } }) }),
  } as unknown as ImagesBinding;
}

test("?w=800 — փոքրացված WebP-ն պատրաստվում է մեկ անգամ և պահվում R2-ում", async () => {
  const { database, bucket, stored } = photoFixtures({ "v1/photo/original.jpg": new Uint8Array(500) });
  const calls = { count: 0 };
  const response = await readCloudMedia(database, bucket, "-100", 1, 0, new Request("https://library.test/media/-100/1/0?w=800&v=abc"), fakeImages(60, calls));
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal((await response.arrayBuffer()).byteLength, 60);
  assert.deepEqual(stored, { "thumbs/v1/photo/original-w800.webp": 60 });
  assert.equal(calls.count, 1);
});

test("?w=800 — պահված փոքր պատկերը տրվում է առանց նոր փոխարկման", async () => {
  const { database, bucket } = photoFixtures({ "v1/photo/original.jpg": new Uint8Array(500), "thumbs/v1/photo/original-w800.webp": new Uint8Array(40) });
  const calls = { count: 0 };
  const response = await readCloudMedia(database, bucket, "-100", 1, 0, new Request("https://library.test/media/-100/1/0?w=800"), fakeImages(60, calls));
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(response.headers.get("Content-Length"), "40");
  assert.equal(calls.count, 0);
});

test("?w= — առանց Images-ի, անհայտ լայնությամբ կամ ոչ նկարի դեպքում տրվում է բնօրինակը", async () => {
  const { database, bucket } = photoFixtures({ "v1/photo/original.jpg": new Uint8Array(500) });
  for (const url of ["https://library.test/media/-100/1/0?w=800", "https://library.test/media/-100/1/0?w=333"]) {
    const response = await readCloudMedia(database, bucket, "-100", 1, 0, new Request(url));
    assert.equal(response.headers.get("Content-Type"), "image/jpeg");
    assert.equal(response.headers.get("Content-Length"), "500");
  }
  const audio = fixtures(objects);
  const calls = { count: 0 };
  const response = await readCloudMedia(audio.database, audio.bucket, "-100", 1, 0, new Request("https://library.test/media/-100/1/0?w=800"), fakeImages(60, calls));
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(calls.count, 0);
});
