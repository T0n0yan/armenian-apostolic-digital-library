import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-help-video";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { helpItemExists, setHelpVideo } from "../data/help-videos.server";
import { isHelpId } from "../utils/help-videos";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

// Workers-ը ընդունում է մինչև 100 ՄԲ. մի քիչ տեղ թողնում ենք
const MAX_BYTES = 95_000_000;
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

/** Օգնության տեսանյութի վերբեռնում. ֆայլը հենց հարցման մարմինն է, ուղիղ R2 (Worker-ի հիշողության մեջ չի պահվում)։ */
export async function action({ request, params }: Route.ActionArgs) {
  await requirePermission(request, env.DB, "help");
  requireSameOrigin(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  if (!isHelpId(params.id) || !(await helpItemExists(DB, params.id))) return Response.json({ error: "Այդպիսի տեսանյութ չկա։" }, { status: 404 });
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const size = Number(request.headers.get("content-length"));
  if (!TYPES[type]) return Response.json({ error: "Տեսանյութը պետք է լինի MP4, MOV կամ WebM։" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return Response.json({ error: "Ֆայլը դատարկ է։" }, { status: 400 });
  if (size > MAX_BYTES || !request.body) return Response.json({ error: "Տեսանյութը շատ մեծ է (առավելագույնը 95 ՄԲ)։" }, { status: 413 });
  const key = `help/${params.id}-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}.${TYPES[type]}`;
  await MEDIA.put(key, request.body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  await setHelpVideo(DB, MEDIA, params.id, { key, size, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true, key });
}
