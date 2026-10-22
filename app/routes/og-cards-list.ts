import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-cards-list";
import { OG_CARD_SECTIONS, listOgCards } from "../data/og-cards.server";

/**
 * The cards to draw, one page of one section at a time: GET /api/og-cards?section=saghmosner
 * &cursor=…, for scripts/og-cards.ts only (bearer TELEGRAM_BRIDGE_SHARED_SECRET).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const secret = (env as { TELEGRAM_BRIDGE_SHARED_SECRET?: string }).TELEGRAM_BRIDGE_SHARED_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "";
  if (!(OG_CARD_SECTIONS as readonly string[]).includes(section)) return Response.json({ sections: OG_CARD_SECTIONS }, { status: 400 });
  const page = await listOgCards(env.DB, section, url.searchParams.get("cursor"));
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}
