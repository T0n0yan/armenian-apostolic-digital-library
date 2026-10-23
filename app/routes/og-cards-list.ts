import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-cards-list";
import { OG_CARD_SECTIONS, listOgCards } from "../data/og-cards.server";
import { OG_CARD_LAYOUT } from "../utils/og-card-layout";

/**
 * The cards to draw, one page of one section at a time: GET /api/og-cards?section=psalms
 * &cursor=…, for scripts/og-cards.ts. Only public text, so no key; kept briefly at the edge.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "";
  // A cheap fingerprint of everything the cards show, so the drawing job can stop at once when
  // nothing changed since its last run (it runs after every Telegram sync).
  if (section === "version") {
    // Only what the cards show: which posts exist, their edits, and the sections' names. Sync times
    // change on every run and would make the job draw again for nothing.
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count, MAX(message_id) AS last, SUM(message_id) AS ids, MAX(COALESCE(edited_at, '')) AS edited
       FROM library_materials WHERE sync_state = 'ready' AND deleted_at IS NULL`,
    ).first<{ count: number; last: number | null; ids: number | null; edited: string | null }>();
    const topics = await env.DB.prepare("SELECT group_concat(id || ':' || status || ':' || name, '|') AS names FROM library_topics").first<{ names: string | null }>();
    const version = [OG_CARD_LAYOUT, row?.count, row?.last, row?.ids, row?.edited, topics?.names].join(":");
    return Response.json({ version }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  if (!(OG_CARD_SECTIONS as readonly string[]).includes(section)) return Response.json({ sections: OG_CARD_SECTIONS }, { status: 400 });
  const page = await listOgCards(env.DB, section, url.searchParams.get("cursor"), url.origin);
  return Response.json(page, { headers: { "cache-control": "public, max-age=60", "x-robots-tag": "noindex" } });
}
