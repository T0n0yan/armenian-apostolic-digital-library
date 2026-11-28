import { env } from "cloudflare:workers";

import type { Route } from "./+types/church-search-api";
import { listGuides } from "../data/guides.server";
import { remember } from "../data/memory-cache.server";
import { searchEtiquette } from "../utils/etiquette-search";

/** «Կարգեր և վարքեր»-ի որոնում (վարք, ուղեցույցներ)։ ?q=…&limit=6 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  if (!query) return Response.json({ hits: [] });
  const guides = await remember(env.DB, "church-guides", 60_000, () => listGuides(env.DB));
  const hits = searchEtiquette(query, limit, guides);
  return Response.json({ hits }, { headers: { "cache-control": "public, max-age=60" } });
}
