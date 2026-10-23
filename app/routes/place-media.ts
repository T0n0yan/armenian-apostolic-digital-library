import { env } from "cloudflare:workers";

import type { Route } from "./+types/place-media";
import { requireAdmin } from "../auth/admin.server";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

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
  if (!isPublic) await requireAdmin(request, DB);
  const key = `places/${params.placeId}/${params.file}`;
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
