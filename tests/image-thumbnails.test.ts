import assert from "node:assert/strict";
import test from "node:test";
import { storedThumb } from "../app/data/image-thumb.server";
import { readCloudMedia } from "../app/data/cloud-media.server";

function fixture(outputSize = 40) {
  const objects = new Map<string, Uint8Array>([["photo.jpg", new Uint8Array(100)]]);
  let calls = 0;
  const bucket = {
    get: async (key: string) => {
      const bytes = objects.get(key);
      return bytes ? { body: new Blob([Uint8Array.from(bytes)]).stream(), size: bytes.length, httpEtag: `"${key}"`, httpMetadata: { contentType: "image/jpeg" } } : null;
    },
    head: async (key: string) => objects.has(key) ? { size: objects.get(key)!.length, httpEtag: `"${key}"` } : null,
    put: async (key: string, bytes: ArrayBuffer | Uint8Array) => { objects.set(key, new Uint8Array(bytes)); },
  } as unknown as R2Bucket;
  const images = {
    input: () => ({ transform: () => ({ output: async () => {
      calls += 1;
      return { response: () => new Response(new Uint8Array(outputSize)) };
    } }) }),
  } as unknown as ImagesBinding;
  return { bucket, images, objects, calls: () => calls };
}

test("միաժամանակյա փոքրացումները կիսում են աշխատանքը և անկախ կարդացվող պատասխաններ են տալիս", async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 4 }, () => storedThumb(f.bucket, f.images, "photo.jpg", 800)));
  assert.equal(f.calls(), 1);
  assert.deepEqual(await Promise.all(responses.map(async response => (await response!.arrayBuffer()).byteLength)), [40, 40, 40, 40]);
  await storedThumb(f.bucket, f.images, "photo.jpg", 800);
  assert.equal(f.calls(), 1);
});

test("չշահավետ փոքրացման որոշումը պահպանվում է, նոր տարբերակը ստուգվում է առանձին", async () => {
  const f = fixture(150);
  assert.equal(await storedThumb(f.bucket, f.images, "photo.jpg", 800), null);
  assert.equal(await storedThumb(f.bucket, f.images, "photo.jpg", 800), null);
  assert.equal(f.calls(), 1);
  assert.ok(f.objects.has("thumbs/photo-w800.webp.skip"));
  await storedThumb(f.bucket, f.images, "photo.jpg", 800, { version: "new" });
  assert.equal(f.calls(), 2);
});

test("փոքր նկարի HEAD-ը համընկնում է GET-ի տեսակին ու չափին և մարմին չունի", async () => {
  const f = fixture();
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ r2_key: "photo.jpg", thumbnail_r2_key: null, mime_type: "image/jpeg" }) }) }) } as unknown as D1Database;
  const url = "https://library.test/media/-100/1/0?w=800";
  const head = await readCloudMedia(db, f.bucket, "-100", 1, 0, new Request(url, { method: "HEAD" }), f.images);
  const get = await readCloudMedia(db, f.bucket, "-100", 1, 0, new Request(url), f.images);
  assert.equal(head.headers.get("content-type"), get.headers.get("content-type"));
  assert.equal(head.headers.get("content-length"), String((await get.arrayBuffer()).byteLength));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(f.calls(), 1);
});

test("փոխարկման ժամանակավոր սխալը չի պահվում որպես մշտական մերժում", async () => {
  const f = fixture();
  const failed = { input: () => { throw new Error("temporary"); } } as unknown as ImagesBinding;
  await assert.rejects(storedThumb(f.bucket, failed, "photo.jpg", 800), /temporary/);
  const result = await storedThumb(f.bucket, f.images, "photo.jpg", 800);
  assert.equal(result?.headers.get("content-type"), "image/webp");
});
