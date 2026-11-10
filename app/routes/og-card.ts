import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-card";
import { CARD_IMAGE_WIDTH, requestedWidth, storedThumb } from "../data/image-thumb.server";
import { ogCardKey } from "../data/og-cards.server";
import { categoryForSection } from "../utils/material-path";
import { sectionImage } from "../utils/seo";

const CARD_CACHE = "public, max-age=3600, s-maxage=86400";
const CARD_WIDTHS = new Set([CARD_IMAGE_WIDTH]);

/**
 * A material's link-preview card (/og/card/psalms/25, /og/card/psalms/25/8), drawn ahead of
 * time into R2 by scripts/og-cards.ts. A card not drawn yet sends the section's picture instead.
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const path = `/${params.section}/${params.item}${params.verse ? `/${params.verse}` : ""}`;
  const { MEDIA, IMAGES } = env as unknown as { MEDIA: R2Bucket; IMAGES?: ImagesBinding };
  const valid = /^\/[a-z-]+\/[a-z0-9-]{1,80}(?:\/\d{1,3})?$/u.test(path);
  // ?w=800 — ցանկի քարտի համար փոքրացված WebP (քարտը 1200 px JPEG է)։ Քարտը վերանկարվում է նույն
  // բանալիով, դրա համար փոքր պատկերի անվան մեջ բնօրինակի etag-ն է։
  const width = valid ? requestedWidth(request, CARD_WIDTHS) : null;
  if (width) {
    const thumb = await MEDIA.head(ogCardKey(path))
      .then((head) => head ? storedThumb(MEDIA, IMAGES, ogCardKey(path), width, { version: head.etag, cacheControl: CARD_CACHE }) : null)
      .catch((error: unknown) => {
        console.error("og card thumb", path, error);
        return null;
      });
    if (thumb) return thumb;
  }
  const object = valid ? await MEDIA.get(ogCardKey(path)).catch(() => null) : null;
  if (!object) {
    const fallback = sectionImage(categoryForSection(params.section)) ?? "/og-image.png?v=2";
    return new Response(null, { status: 302, headers: { location: fallback, "cache-control": "public, max-age=300" } });
  }
  return new Response(object.body, {
    headers: { "content-type": "image/jpeg", "cache-control": CARD_CACHE, etag: object.httpEtag },
  });
}
