import { env } from "cloudflare:workers";

import type { Route } from "./+types/church-candles";
import { requireSameOrigin } from "../auth/admin.server";
import { candleState, isKnownChurch, lightCandle } from "../data/church-candles.server";
import { rateKey, tooMany, withinRateLimit, type RateLimiter } from "../utils/rate-limit";

const headers = { "cache-control": "no-store" };

/** Այսօր վառված մոմերը (GET ?church=template:cross-domed)։ */
export async function loader({ request }: Route.LoaderArgs) {
  if (!(await withinRateLimit((env as { READ_RATE_LIMIT?: RateLimiter }).READ_RATE_LIMIT, rateKey(request, "church-candles")))) return tooMany();
  const church = new URL(request.url).searchParams.get("church");
  if (!(await isKnownChurch(env.DB, church))) return Response.json({ error: "unknown church" }, { status: 400, headers });
  return Response.json(await candleState(env.DB, church as string), { headers });
}

/** Վառել մոմ ({ church, token })՝ անանուն, օրը մեկ անգամ ամեն սարքից։ */
export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);
  if (!(await withinRateLimit((env as { WRITE_RATE_LIMIT?: RateLimiter }).WRITE_RATE_LIMIT, rateKey(request, "church-candles")))) return tooMany();
  const body = (await request.json().catch(() => null)) as { church?: unknown; token?: unknown } | null;
  if (!(await isKnownChurch(env.DB, body?.church))) return Response.json({ error: "unknown church" }, { status: 400, headers });
  return Response.json(await lightCandle(env.DB, body?.church as string, body?.token), { headers });
}
