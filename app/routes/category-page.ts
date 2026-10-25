import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { searchValidation } from "../utils/search-validation";
import { env } from "cloudflare:workers";

import type { Route } from "./+types/category-page";
import { getActiveCategoryBySlug } from "../data/categories.server";
import { listPublicMaterialPageByCategory } from "../data/materials.server";
import { searchMaterials } from "../data/search-materials.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { CloudLibraryCursorError } from "../data/cloud-library.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
  const url = new URL(request.url);
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (url.searchParams.has("q") && searchValidation(query, true)) throw new Response("Գրեք բառ կամ սաղմոսի համար՝ 1–150։", { status: 400 });
  const category = await getActiveCategoryBySlug(env.DB, params.slug, request.signal);
  if (!category) throw new Response("Not Found", { status: 404 });
  if (query && searchValidation(query, resolveContentCategoryId(category.id, category.name) === "category_psalms")) throw new Response("Գրեք բառ կամ սաղմոսների բաժնում՝ սաղմոսի համար։", { status: 400 });
  if (!query) {
    return Response.json(await listPublicMaterialPageByCategory(
      env.DB,
      category.id,
      category.defaultSort,
      cursor,
      request.signal,
    ));
  }
  const resolved = await resolveSearchQuery(env.DB, query);
  return Response.json(await searchMaterials(env.DB, {
    query,
    categoryId: category.id,
    scope: "library",
    dateFrom: "",
    dateTo: "",
  }, cursor, 20, resolved, request.signal));
  } catch (error) {
    if (error instanceof CloudLibraryCursorError) throw new Response("Invalid cursor", { status: 400 });
    throw error;
  }
}
