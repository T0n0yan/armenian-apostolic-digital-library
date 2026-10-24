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
  const cache = asked === version ? "public, max-age=31536000, immutable" : "no-store";
  return Response.json(await buildSearchIndex(env.DB, version), { headers: { "Cache-Control": cache } });
}
