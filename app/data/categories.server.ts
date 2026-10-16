import type { BridgeCategory } from "../../shared/telegram-bridge-contract";
import { listBridgeCategories } from "./telegram-bridge.server";

export type CategorySummary = BridgeCategory;

export async function listActiveCategories(database: D1Database, refresh = false): Promise<CategorySummary[]> {
  return listBridgeCategories(database, refresh);
}

export async function getActiveCategoryBySlug(
  database: D1Database,
  slug: string,
): Promise<Omit<CategorySummary, "materialCount"> | null> {
  const category = (await listBridgeCategories(database)).find((item) => item.slug === slug);
  return category ?? null;
}
