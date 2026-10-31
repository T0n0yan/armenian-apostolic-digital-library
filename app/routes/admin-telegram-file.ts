import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-telegram-file";
import { requirePermission } from "../auth/admin.server";
import { fetchTelegramFile } from "../data/places.server";

/**
 * A photo a reader sent with /place, shown in /admin/places before it is copied to the site: from
 * Telegram, or from R2 when it came with the site's form ("r2:submissions/…").
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "places");
  if (params.fileId.startsWith("r2:submissions/")) {
    const object = await (env as unknown as { MEDIA: R2Bucket }).MEDIA.get(params.fileId.slice(3));
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
  }
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  const file = token ? await fetchTelegramFile(token, params.fileId) : null;
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: { "content-type": file.type, "cache-control": "private, max-age=3600" } });
}
