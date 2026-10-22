import { env } from "cloudflare:workers";

import type { Route } from "./+types/og-card";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath, resolveMaterialId } from "../data/material-page.server";
import { renderOgCard } from "../data/og-card.server";
import { psalmBodyText } from "../utils/material-title";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/**
 * The link-preview picture of a material without a picture of its own (a psalm, one psalm verse,
 * a prayer, a Bible question): /og/card/saghmosner/25, /og/card/saghmosner/25/8.
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const materialId = await resolveMaterialId(params);
  const material = materialId ? await getPublicMaterialDetail(env.DB, materialId, request.signal) : null;
  if (!material) return new Response("Not Found", { status: 404 });
  const kind = resolveContentCategoryId(null, material.categoryName);
  const psalmPath = canonicalMaterialPath(material);
  let label = material.title;
  let text = material.poll?.question.text || material.contentText || material.captionText || material.title;
  if (kind === "category_psalms") {
    const verses = psalmVerseList(psalmBodyText(material));
    const number = params.verse && /^\d{1,3}$/u.test(params.verse) ? Number(params.verse) : null;
    const verse = number ? verses.find((item) => item.number === number) : null;
    if (number && !verse) return new Response("Not Found", { status: 404 });
    const psalm = /\/saghmosner\/(\d{1,3})$/u.exec(psalmPath)?.[1];
    label = verse ? verseLabel(psalmPath, material.title, verse.number) : psalm ? `Սաղմոս ${psalm}` : material.title;
    text = verse ? verse.text : verses.slice(0, 3).map((item) => item.text).join(" ") || text;
  }
  const png = await renderOgCard({ label, text, section: material.categoryName.toLocaleUpperCase("hy") });
  const response = new Response(png.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  await cache.put(request, response.clone()).catch(() => undefined);
  return response;
}
