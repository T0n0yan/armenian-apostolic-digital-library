import { env } from "cloudflare:workers";

import { listCloudLibraryCategories } from "../data/cloud-library.server";
import { remember } from "../data/memory-cache.server";
import { createMaterialId } from "../../shared/telegram-bridge-contract";
import { materialPath } from "../utils/material-path";
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
         COALESCE(materials.edited_at, materials.published_at) AS changed_at
       FROM library_materials AS materials
       INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
       WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
         AND topics.is_general = 0 AND topics.status != 'hidden'
       ORDER BY materials.message_id`,
    ).all<{ chat_id: string; message_id: number; category_name: string; changed_at: string | null }>();
    const entry = (path: string, changed?: string | null, priority = "0.6") =>
      `<url><loc>${escape(`${SITE_URL}${path}`)}</loc>${changed ? `<lastmod>${changed.slice(0, 10)}</lastmod>` : ""}<priority>${priority}</priority></url>`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      entry("/", null, "1.0"),
      ...categories.map((category) => entry(`/categories/${category.slug}`, null, "0.8")),
      ...results.map((row) => entry(materialPath(createMaterialId(row.chat_id, row.message_id), row.category_name), row.changed_at)),
      entry("/privacy", null, "0.2"),
      "</urlset>",
    ].join("\n");
  });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
