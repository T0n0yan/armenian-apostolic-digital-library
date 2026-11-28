import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-church-audio";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { removeChurchAudio, setChurchAudio } from "../data/liturgy-text.server";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

// Workers-ը ընդունում է մինչև 100 ՄԲ
const MAX_BYTES = 95_000_000;
const TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/ogg": "ogg", "audio/opus": "ogg" };
/** patarag՝ Պատարագի ձայնագրությունը, hymn-12՝ շարականինը։ */
const isAudioId = (value: string) => /^(patarag|hymn-\d{1,9})$/u.test(value);

/** Ձայնագրության վերբեռնում (մարմինը՝ ֆայլը, ուղիղ R2) կամ ջնջում (DELETE)։ */
export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  if (!isAudioId(params.id)) return Response.json({ error: "Սխալ հասցե։" }, { status: 404 });
  if (request.method === "DELETE") {
    await removeChurchAudio(DB, MEDIA, params.id);
    return Response.json({ ok: true });
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const size = Number(request.headers.get("content-length"));
  if (!TYPES[type]) return Response.json({ error: "Ձայնագրությունը պետք է լինի MP3, M4A կամ OGG։" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return Response.json({ error: "Ֆայլը դատարկ է։" }, { status: 400 });
  if (size > MAX_BYTES || !request.body) return Response.json({ error: "Ֆայլը շատ մեծ է (առավելագույնը 95 ՄԲ)։" }, { status: 413 });
  const key = `church/${params.id}-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}.${TYPES[type]}`;
  const contentType = TYPES[type] === "mp3" ? "audio/mpeg" : TYPES[type] === "m4a" ? "audio/mp4" : "audio/ogg";
  await MEDIA.put(key, request.body, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
  await setChurchAudio(DB, MEDIA, params.id, { key, type: contentType, size }, admin.email);
  return Response.json({ ok: true, key });
}
