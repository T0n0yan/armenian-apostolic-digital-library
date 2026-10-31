import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-place-video";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { getPlace, setPlacePictures } from "../data/places.server";
import { bumpCacheEpoch } from "../data/site-refresh.server";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

// The Workers plan takes request bodies up to 100 MB; a little room is left.
export const PLACE_VIDEO_MAX_BYTES = 95_000_000;
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

/**
 * A place's video from the admin's phone: the file is the request body itself, streamed straight
 * into R2 (a form would hold the whole video in the Worker's memory). Replaces the earlier one.
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requirePermission(request, env.DB, "places");
  requireSameOrigin(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  const place = await getPlace(DB, params.id);
  if (!place) return Response.json({ error: "Տեղը չի գտնվել։" }, { status: 404 });
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const size = Number(request.headers.get("content-length"));
  if (!TYPES[type]) return Response.json({ error: "Տեսանյութը պետք է լինի MP4, MOV կամ WebM։" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return Response.json({ error: "Ֆայլը դատարկ է։" }, { status: 400 });
  if (size > PLACE_VIDEO_MAX_BYTES || !request.body) return Response.json({ error: "Տեսանյութը շատ մեծ է (առավելագույնը 95 ՄԲ)։" }, { status: 413 });
  const key = `places/${place.id}/video-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}.${TYPES[type]}`;
  await MEDIA.put(key, request.body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  // The earlier uploaded video goes (a YouTube link is only text).
  if (place.videoUrl.startsWith("places/")) await MEDIA.delete(place.videoUrl);
  await setPlacePictures(DB, place.id, { videoUrl: key });
  await bumpCacheEpoch(DB);
  return Response.json({ ok: true, key });
}
