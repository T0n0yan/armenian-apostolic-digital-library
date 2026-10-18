import { env } from "cloudflare:workers";

import type { Route } from "./+types/push";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";

const noStore = { "Cache-Control": "private, no-store" };

/** GET → the Web Push public key (null when push isn't configured). */
export async function loader() {
  return Response.json({ publicKey: (env as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY ?? null }, { headers: noStore });
}

/** Saves ({ subscription }) or removes ({ endpoint, remove: true }) this browser's push subscription. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    endpoint?: unknown; remove?: unknown;
  } | null;
  if (body?.remove === true && typeof body.endpoint === "string") {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(body.endpoint, user.id).run();
    return Response.json({ ok: true }, { headers: noStore });
  }
  const endpoint = body?.subscription?.endpoint;
  const p256dh = body?.subscription?.keys?.p256dh;
  const auth = body?.subscription?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return Response.json({ ok: false }, { status: 400, headers: noStore });
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).bind(endpoint, user.id, p256dh, auth).run();
  return Response.json({ ok: true }, { headers: noStore });
}
