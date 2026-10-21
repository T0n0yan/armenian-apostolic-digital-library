import { env } from "cloudflare:workers";

import { listCloudLibraryCategories } from "../data/cloud-library.server";
import { remember } from "../data/memory-cache.server";
import { createMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { psalmNumber } from "../utils/psalm-number";
import { materialPath, sectionPath } from "../utils/material-path";
import { SITE_URL } from "../utils/seo";

function escape(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

/** /sitemap.xml — every public page for search engines: home, sections and all materials. */
export async function loader() {
  const xml = await remember(env.DB, "sitemap", 3_600_000, async () => {
    const categories = (await listCloudLibraryCategories(env.DB)).filter((category) => !category.isGeneral && category.status !== "hidden");
    const { results } = await env.DB.prepare(
      `SELECT materials.chat_id, materials.message_id, topics.title AS category_name,
         materials.title, substr(COALESCE(materials.content_text, materials.caption_text, ''), 1, 400) AS head,
         (SELECT media.title FROM library_media AS media WHERE media.chat_id = materials.chat_id
            AND media.message_id = materials.message_id AND media.kind IN ('audio', 'voice') LIMIT 1) AS media_title,
         COALESCE(materials.edited_at, materials.published_at) AS changed_at
       FROM library_materials AS materials
       INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
       WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
         AND topics.is_general = 0 AND topics.status != 'hidden'
       ORDER BY materials.message_id`,
    ).all<{ chat_id: string; message_id: number; category_name: string; title: string; head: string; media_title: string | null; changed_at: string | null }>();
    const entry = (path: string, changed?: string | null, priority = "0.6") =>
      `<url><loc>${escape(`${SITE_URL}${path}`)}</loc>${changed ? `<lastmod>${changed.slice(0, 10)}</lastmod>` : ""}<priority>${priority}</priority></url>`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      entry("/", null, "1.0"),
      ...categories.map((category) => entry(sectionPath(category), null, "0.8")),
      ...results.map((row) => {
        const psalm = resolveContentCategoryId(null, row.category_name) === "category_psalms"
          ? psalmNumber({ title: row.title, excerpt: row.head, preview: { mediaTitle: row.media_title } })
          : null;
        return entry(materialPath(createMaterialId(row.chat_id, row.message_id), row.category_name, { title: row.title, psalm }), row.changed_at);
      }),
      entry("/mer-masin", null, "0.3"),
      entry("/kap", null, "0.3"),
      entry("/privacy", null, "0.2"),
      "</urlset>",
    ].join("\n");
  });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
