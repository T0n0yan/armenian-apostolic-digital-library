import { categoryBySlug, type BridgeCategory } from "../../shared/telegram-bridge-contract";
import { listBridgeCategories } from "./telegram-bridge.server";

export type CategorySummary = BridgeCategory;

export async function listActiveCategories(database: D1Database): Promise<CategorySummary[]> {
  return listBridgeCategories(database);
}

export async function getActiveCategoryBySlug(
  database: D1Database,
  slug: string,
): Promise<Omit<CategorySummary, "materialCount"> | null> {
  const definition = categoryBySlug(slug);
  if (!definition) return null;
  const category = (await listBridgeCategories(database)).find((item) => item.slug === slug);
  return category ? {
    id: category.id,
    slug: category.slug,
    name: category.name,
    defaultSort: category.defaultSort,
  } : null;
}
