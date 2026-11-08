import { env } from "cloudflare:workers";

import type { Route } from "./+types/client-error";
import { parseClientError, recordClientError } from "../data/client-errors.server";
import { rateKey, tooMany, withinRateLimit, type RateLimiter } from "../utils/rate-limit";

/** Բրաուզերի սխալը (client-error-reporter.tsx). միայն մեր էջերից, սահմանափակ քանակով։ */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" || new URL(request.url).origin !== request.headers.get("origin")) return new Response(null, { status: 403 });
  if (!(await withinRateLimit((env as { WRITE_RATE_LIMIT?: RateLimiter }).WRITE_RATE_LIMIT, rateKey(request, "client-error")))) return tooMany();
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) return new Response(null, { status: 413 });
  const report = parseClientError(await request.json().catch(() => null));
  if (!report) return new Response(null, { status: 400 });
  await recordClientError(env.DB, report).catch((error: unknown) => console.error("client error record", error));
  return new Response(null, { status: 204 });
}
