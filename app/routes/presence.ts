import { env } from "cloudflare:workers";

import type { Route } from "./+types/presence";
import { touchPresence, validPlatform } from "../data/presence.server";

/** { visitorId, platform, inTelegram } — a page is open on this device. */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" || new URL(request.url).origin !== request.headers.get("origin")) return new Response(null, { status: 403 });
  const body = (await request.json().catch(() => null)) as { visitorId?: unknown; platform?: unknown; inTelegram?: unknown } | null;
  const visitorId = typeof body?.visitorId === "string" && /^[a-zA-Z0-9-]{8,64}$/u.test(body.visitorId) ? body.visitorId : null;
  if (!visitorId) return new Response(null, { status: 400 });
  await touchPresence(env.DB, { visitorId, platform: validPlatform(body?.platform), inTelegram: body?.inTelegram === true }).catch(() => null);
  return new Response(null, { status: 204 });
}
