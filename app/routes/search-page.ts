import { listCloudLibraryCategories } from "../data/cloud-library.server";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { searchValidation } from "../utils/search-validation";
import { env } from "cloudflare:workers";

import type { Route } from "./+types/search-page";
import type { SearchFilters } from "../data/search-materials";
import { searchMaterials } from "../data/search-materials.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { CloudLibraryCursorError } from "../data/cloud-library.server";

function date(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : "";
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (url.searchParams.has("q") && searchValidation(query, true)) throw new Response("Գրեք բառ կամ սաղմոսի համար՝ 1–150։", { status: 400 });
  if (searchValidation(query, true)) return Response.json({ materials: [], total: 0, highlightQuery: "", nextCursor: null });
  const filters: SearchFilters = {
    query,
    categoryId: (url.searchParams.get("category") ?? "").slice(0, 80),
    scope: "library",
    dateFrom: date(url.searchParams.get("from")),
    dateTo: date(url.searchParams.get("to")),
  };
  const category = (await listCloudLibraryCategories(env.DB)).find((item) => item.id === filters.categoryId);
  if (searchValidation(query, resolveContentCategoryId(category?.id, category?.name) === "category_psalms")) return Response.json({ error: "Գրեք բառ կամ սաղմոսի համար։" }, { status: 400 });
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
  const resolved = await resolveSearchQuery(env.DB, query);
  return Response.json(await searchMaterials(env.DB, filters, cursor, 20, resolved, request.signal));
  } catch (error) {
    if (error instanceof CloudLibraryCursorError) throw new Response("Invalid cursor", { status: 400 });
    throw error;
  }
}
