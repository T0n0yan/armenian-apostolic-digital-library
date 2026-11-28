import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { sectionInfo } from "./sections";

export type MaterialCardVariant = "default" | "text" | "video" | "psalm" | "portrait" | "daily";

/**
 * How a material looks in mixed lists (search results, saved materials): in its own section's
 * style, so a psalm shows its number, a saint their portrait and a daily reading its date.
 */
export function cardVariantFor(material: { categoryName?: string | null }): MaterialCardVariant {
  return sectionInfo(resolveContentCategoryId(null, material.categoryName))?.card ?? "default";
}
