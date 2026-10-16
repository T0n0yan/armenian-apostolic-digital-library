import type { BridgeCategory } from "../../shared/telegram-bridge-contract";
import { listBridgeCategories } from "./telegram-bridge.server";

export type CategorySummary = BridgeCategory;

export function isNavigableCategory(category: CategorySummary) {
  return !category.isGeneral && category.topicId !== 1;
}

export async function listActiveCategories(
  database: D1Database,
  refresh = false,
  signal?: AbortSignal,
): Promise<CategorySummary[]> {
  return (await listBridgeCategories(database, refresh, signal)).filter(isNavigableCategory);
}

export async function getActiveCategoryBySlug(
  database: D1Database,
  slug: string,
  signal?: AbortSignal,
): Promise<Omit<CategorySummary, "materialCount"> | null> {
  const category = (await listBridgeCategories(database, false, signal))
    .filter(isNavigableCategory)
    .find((item) => item.slug === slug);
  return category ?? null;
}
