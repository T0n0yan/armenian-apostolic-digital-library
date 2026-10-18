import { env } from "cloudflare:workers";

import { listCloudLibraryCategories } from "../data/cloud-library.server";
import { searchSuggestions } from "../utils/search-suggestions";

const dateTitle = /^\d{1,2}\s+\p{L}+,?\s+\d{4}$/u;

/** Words and material titles for the search box's suggestions (shared, edge-cached JSON). */
export async function loader() {
  const [categories, titles] = await Promise.all([
    listCloudLibraryCategories(env.DB),
    env.DB.prepare(
      `SELECT DISTINCT materials.title FROM library_materials AS materials
       INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
       WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
         AND topics.is_general = 0 AND topics.status != 'hidden'
       ORDER BY materials.message_id DESC LIMIT 600`,
    ).all<{ title: string }>(),
  ]);
  const materialTitles = titles.results
    .map((row) => row.title.replace(/[​-‍﻿]/gu, "").replace(/\s+/gu, " ").trim())
    .filter((title) => title.length >= 3 && title.length <= 80 && !dateTitle.test(title));
  const visibleCategories = categories.filter((category) => !category.isGeneral && category.status !== "hidden");
  return Response.json(
    { terms: [...new Set([...searchSuggestions(visibleCategories.map((category) => category.name)), ...materialTitles])] },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
