import { env } from "cloudflare:workers";

import type { Route } from "./+types/place-media";
import { requirePermission } from "../auth/admin.server";

type Bindings = { DB: D1Database; MEDIA: R2Bucket; IMAGES?: ImagesBinding };

// 1200՝ սրբավայրի էջի և հղման նախադիտման նկարը (բնօրինակը կարող է 2 ՄԲ լինել)։
const THUMB_WIDTHS = new Set([160, 320, 1200]);

/**
 * A place's photo, drawing or video from R2 (/place-media/haghpat/photo-x.jpg). Pictures of a place
 * not published yet are shown to admins only. Videos answer range requests so they can be seeked.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { DB, MEDIA } = env as unknown as Bindings;
  if (!/^[a-z0-9-]{1,80}$/u.test(params.placeId) || !/^[a-z0-9.-]{1,80}$/u.test(params.file)) return new Response(null, { status: 404 });
  const place = await DB.prepare("SELECT published FROM places WHERE id = ?").bind(params.placeId).first<{ published: number }>();
  if (!place) return new Response(null, { status: 404 });
  const isPublic = Boolean(place.published);
  if (!isPublic) await requirePermission(request, DB, "places");
  const key = `places/${params.placeId}/${params.file}`;
  // ?w=160 — փոքր պատկեր քարտեզի նշանի և ցանկի համար (ամբողջական լուսանկարը 300–400 ԿԲ է)։
  const width = Number(new URL(request.url).searchParams.get("w"));
  if (isPublic && THUMB_WIDTHS.has(width) && !/\.(mp4|mov|webm)$/iu.test(params.file)) {
    const thumb = await placeThumb(MEDIA, (env as unknown as Bindings).IMAGES, key, width).catch((error: unknown) => {
      console.error("place thumb", key, width, error);
      return null;
    });
    if (thumb) return thumb;
  }
  const range = request.headers.get("range");
  const object = await MEDIA.get(key, range ? { range: request.headers } : undefined);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", isPublic ? "public, max-age=86400" : "private, no-store");
  if (range && "range" in object && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

/**
 * Փոքր պատկերը R2-ից (`thumbs/places/...-w160.webp`). Չկա՝ պատրաստում է Cloudflare Images-ով
 * (Worker-ի CPU-ն չի ծախսվում) և պահում R2-ում, որ ամեն նկար մեկ անգամ փոխարկվի։ Ցանկացած
 * սխալի դեպքում (null) տրվում է բնօրինակը։
 */
async function placeThumb(media: R2Bucket, images: ImagesBinding | undefined, key: string, width: number) {
  const thumbKey = `thumbs/${key.replace(/\.[a-z0-9]+$/iu, "")}-w${width}.webp`;
  const headers = { "content-type": "image/webp", "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff" };
  const stored = await media.get(thumbKey);
  if (stored) return new Response(stored.body, { headers: { ...headers, etag: stored.httpEtag } });
  if (!images) return null;
  const original = await media.get(key);
  if (!original || !(original.httpMetadata?.contentType ?? "image/").startsWith("image/")) return null;
  const result = await images.input(original.body).transform({ width, fit: "scale-down" }).output({ format: "image/webp", quality: 80 });
  const bytes = await result.response().arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength >= original.size) return null;
  await media.put(thumbKey, bytes, { httpMetadata: { contentType: "image/webp" } });
  return new Response(bytes, { headers });
}
