import { env } from "cloudflare:workers";

import type { Route } from "./+types/personal-api";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { getActiveCategoryBySlug, listActiveCategories } from "../data/categories.server";
import { loadCategoryPersonal } from "../data/category-personal.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { loadMaterialPersonal, resolveMaterialId } from "../data/material-page.server";
import { OLD_SECTION_SLUGS, categoryForSection } from "../utils/material-path";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Էջի անձնական մասը (utils/personal-data.ts). /api/personal?kind=material&path=/psalms/22 կամ
 * kind=category&path=/psalms։ Էջի մնացածը բոլորի համար նույնն է և պահվում է cache-ում։
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const path = url.searchParams.get("path") ?? "";
  if (!/^\/[^?#]{1,300}$/u.test(path) || (kind !== "material" && kind !== "category")) return Response.json({ error: "bad request" }, { status: 400, headers: PRIVATE });
  const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const user = await getOptionalTelegramUser(request);

  if (kind === "material") {
    const materialId = segments[0] === "materials" && segments.length === 2
      ? await resolveMaterialId({ materialId: segments[1] })
      : segments.length === 2 ? await resolveMaterialId({ section: segments[0], item: segments[1] }) : null;
    const material = materialId && /^material_[a-zA-Z0-9_-]{1,220}$/u.test(materialId) ? await getPublicMaterialDetail(env.DB, materialId, request.signal) : null;
    if (!material) return Response.json({ error: "not found" }, { status: 404, headers: PRIVATE });
    return Response.json(await loadMaterialPersonal(material, user, request), { headers: PRIVATE });
  }

  const category = segments[0] === "categories" && segments.length === 2
    ? await getActiveCategoryBySlug(env.DB, segments[1], request.signal)
    : segments.length === 1 ? await sectionCategory(segments[0]) : null;
  if (!category) return Response.json({ error: "not found" }, { status: 404, headers: PRIVATE });
  return Response.json(await loadCategoryPersonal(category, user), { headers: PRIVATE });
}

/** /psalms (կամ հին /saghmosner) → բաժինը։ */
async function sectionCategory(segment: string) {
  const contentCategory = categoryForSection(OLD_SECTION_SLUGS[segment] ?? segment);
  if (!contentCategory) return null;
  return (await listActiveCategories(env.DB, false)).find((item) => resolveContentCategoryId(item.id, item.name) === contentCategory) ?? null;
}
