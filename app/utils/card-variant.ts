import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

export type MaterialCardVariant = "default" | "text" | "video" | "psalm" | "portrait" | "daily";

/**
 * How a material looks in mixed lists (search results, saved materials): in its own section's
 * style, so a psalm shows its number, a saint their portrait and a daily reading its date.
 */
export function cardVariantFor(material: { categoryName?: string | null }): MaterialCardVariant {
  switch (resolveContentCategoryId(null, material.categoryName)) {
    case "category_psalms": return "psalm";
    case "category_saints_lives": return "portrait";
    case "category_prayers":
    case "category_bible_questions": return "text";
    case "category_gospel_teachings": return "video";
    case "category_daily_readings": return "daily";
    default: return "default";
  }
}
