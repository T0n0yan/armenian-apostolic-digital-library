import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-telegram-file";
import { requirePermission } from "../auth/admin.server";
import { fetchTelegramFile } from "../data/places.server";

/** A photo a reader sent with /place, shown in /admin/places before it is copied to the site. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "places");
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  const file = token ? await fetchTelegramFile(token, params.fileId) : null;
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: { "content-type": file.type, "cache-control": "private, max-age=3600" } });
}
