import { remember } from "../data/memory-cache.server";
import { env } from "cloudflare:workers";

import type { Route } from "./+types/search-index";
import { contentVersion } from "../data/content-version.server";
import { buildSearchIndex } from "../data/search-index.server";

/**
 * GET /api/search-index?v=<content version> — the title index the phone searches by itself. The
 * address changes with the content, so browsers and the edge keep each version for good.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const version = await contentVersion(env.DB);
  const asked = new URL(request.url).searchParams.get("v");
  // An old version asked for: send the current one, but don't let it be kept under the old address.
  if (asked !== version) return new Response(null, { status: 302, headers: { Location: `/api/search-index?v=${encodeURIComponent(version)}`, "Cache-Control": "no-store" } });
  const headers = { "Cache-Control": "public, max-age=31536000, immutable", "X-Offline-Public": "1", "Content-Type": "application/json; charset=utf-8" };
  // One slot bounds storage even after thousands of content updates. Metadata guards version races.
  const key = "public-index/title/current.json";
  // R2 shares the prepared public projection across isolates/regions. Failure falls back to D1.
  const stored = await env.MEDIA.get(key).catch(() => null);
  if (stored?.customMetadata?.version === version) return new Response(stored.body, { headers });
  if (stored) await stored.body.cancel();
  const index = await remember(env.DB, `title-index:${version}`, 60_000, () => buildSearchIndex(env.DB, version));
  const body = JSON.stringify(index);
  await env.MEDIA.put(key, body, { customMetadata: { version }, httpMetadata: { contentType: headers["Content-Type"], cacheControl: "no-cache" } }).catch(() => undefined);
  return new Response(body, { headers });
}
