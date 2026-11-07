import { env } from "cloudflare:workers";

import type { Route } from "./+types/story-upload";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { sniffImageType } from "../utils/image-magic";

// Mini App-ի story-ի համար. Telegram-ի shareToStory-ն և downloadFile-ը ընդունում են միայն հղում,
// ոչ թե ֆայլ, դրա համար պատրաստի նկարը կարճ ժամանակով պահվում է R2-ում (`stories/`)։
// Գիշերային մաքրումը ջնջում է 2 օրից հին նկարները (`removeOldStories`)։

const MAX_BYTES = 3 * 1024 * 1024;

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  if (user.source !== "telegram") return Response.json({ url: null }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return Response.json({ url: null }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES || sniffImageType(bytes) !== "image/jpeg") {
    return Response.json({ url: null }, { status: 400 });
  }
  const id = crypto.randomUUID().replaceAll("-", "");
  await env.MEDIA.put(`stories/${id}.jpg`, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  return Response.json({ url: `${new URL(request.url).origin}/story/${id}.jpg` });
}
