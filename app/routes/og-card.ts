import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-card";
import { ogCardKey } from "../data/og-cards.server";
import { categoryForSection } from "../utils/material-path";
import { sectionImage } from "../utils/seo";

/**
 * A material's link-preview card (/og/card/saghmosner/25, /og/card/saghmosner/25/8), drawn ahead of
 * time into R2 by scripts/og-cards.ts. A card not drawn yet sends the section's picture instead.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const path = `/${params.section}/${params.item}${params.verse ? `/${params.verse}` : ""}`;
  const object = /^\/[a-z-]+\/[a-z0-9-]{1,80}(?:\/\d{1,3})?$/u.test(path)
    ? await (env as unknown as { MEDIA: R2Bucket }).MEDIA.get(ogCardKey(path)).catch(() => null)
    : null;
  if (!object) {
    const fallback = sectionImage(categoryForSection(params.section)) ?? "/og-image.png";
    return new Response(null, { status: 302, headers: { location: fallback, "cache-control": "public, max-age=300" } });
  }
  return new Response(object.body, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600, s-maxage=86400", etag: object.httpEtag },
  });
}
