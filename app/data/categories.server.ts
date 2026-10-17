import type { BridgeCategory } from "../../shared/telegram-bridge-contract";
import { listCloudLibraryCategories } from "./cloud-library.server";

export type CategorySummary = BridgeCategory;

export function isNavigableCategory(category: CategorySummary) {
  return !category.isGeneral && category.topicId !== 1;
}

export async function listActiveCategories(
  database: D1Database,
  _refresh = false,
  _signal?: AbortSignal,
): Promise<CategorySummary[]> {
  return (await listCloudLibraryCategories(database)).filter(isNavigableCategory);
}

export async function getActiveCategoryBySlug(
  database: D1Database,
  slug: string,
  _signal?: AbortSignal,
): Promise<Omit<CategorySummary, "materialCount"> | null> {
  const category = (await listCloudLibraryCategories(database))
    .filter(isNavigableCategory)
    .find((item) => item.slug === slug);
  return category ?? null;
}
