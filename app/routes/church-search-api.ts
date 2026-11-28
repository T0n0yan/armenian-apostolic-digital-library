import { env } from "cloudflare:workers";

import type { Route } from "./+types/church-search-api";
import { listGuides } from "../data/guides.server";
import { remember } from "../data/memory-cache.server";
import { listQuestions, recordMiss } from "../data/questions.server";
import { searchEtiquette } from "../utils/etiquette-search";

/** «Կարգեր և վարքեր»-ի որոնում (վարք, ուղեցույցներ, ՀՏՀ)։ ?q=…&limit=6&record=1 (record՝ ոչինչ չգտնելիս պահել բառը, անանուն) */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  if (!query) return Response.json({ hits: [] });
  const guides = await remember(env.DB, "church-guides", 60_000, () => listGuides(env.DB));
  const questions = await remember(env.DB, "church-questions", 60_000, () => listQuestions(env.DB));
  const hits = searchEtiquette(query, limit, guides, questions);
  if (!hits.length && url.searchParams.get("record") === "1") await recordMiss(env.DB, query, "church").catch(() => null);
  return Response.json({ hits }, { headers: { "cache-control": "private, max-age=60" } });
}
