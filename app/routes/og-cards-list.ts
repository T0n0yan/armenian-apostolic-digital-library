import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-cards-list";
import { OG_CARD_SECTIONS, listOgCards } from "../data/og-cards.server";

/**
 * The cards to draw, one page of one section at a time: GET /api/og-cards?section=saghmosner
 * &cursor=…, for scripts/og-cards.ts. Only public text, so no key; kept briefly at the edge.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "";
  if (!(OG_CARD_SECTIONS as readonly string[]).includes(section)) return Response.json({ sections: OG_CARD_SECTIONS }, { status: 400 });
  const page = await listOgCards(env.DB, section, url.searchParams.get("cursor"));
  return Response.json(page, { headers: { "cache-control": "public, max-age=60", "x-robots-tag": "noindex" } });
}
