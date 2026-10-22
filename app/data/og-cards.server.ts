import { getPublicMaterialDetail, type MaterialDetail } from "./material-detail.server";
import { canonicalMaterialPath } from "./material-page.server";
import { listPublicMaterialPageByCategory } from "./materials.server";
import { listActiveCategories } from "./categories.server";
import { categoryForSection } from "../utils/material-path";
import { psalmBodyText } from "../utils/material-title";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/**
 * Link-preview cards are drawn ahead of time (scripts/og-cards.ts, by GitHub Actions: drawing one
 * takes about a second of CPU, more than a Worker request may use) and kept in R2 under these keys.
 */
export const OG_CARD_SECTIONS = ["psalms", "pray", "saints", "gospel", "daily", "questions"] as const;

export function ogCardKey(path: string) {
  return `og/v1${path}.jpg`;
}

/** A card's version: changes when the material is edited, so previews and the R2 copy refresh. */
export function ogCardVersion(material: Pick<MaterialDetail, "editedAt" | "publishedAt">) {
  return (material.editedAt ?? material.publishedAt ?? "").replace(/\D/gu, "").slice(0, 14) || "0";
}

export type OgCard = { path: string; version: string; section: string; label: string; subtitle?: string; text: string };

/** The cards of one material: the material itself and, for a psalm, each of its verses. */
export function cardsFor(material: MaterialDetail): OgCard[] {
  const path = canonicalMaterialPath(material);
  const version = ogCardVersion(material);
  const section = material.categoryName.toLocaleUpperCase("hy");
  // Everything else: its name on top, its opening text below.
  if (resolveContentCategoryId(null, material.categoryName) !== "category_psalms") {
    const text = material.poll?.question.text || material.contentText || material.captionText || "";
    return [{ path, version, section, label: material.title, text }];
  }
  const verses = psalmVerseList(psalmBodyText(material));
  const psalm = /\/psalms\/(\d{1,3})$/u.exec(path)?.[1];
  // A whole psalm: «Սաղմոս 22» large, its title under it, then its opening verses.
  const whole = { path, version, section, label: psalm ? `Սաղմոս ${psalm}` : material.title, subtitle: psalm ? material.title : undefined, text: verses.slice(0, 3).map((verse) => verse.text).join(" ") };
  return [whole, ...verses.map((verse) => ({ path: `${path}/${verse.number}`, version, section, label: verseLabel(path, material.title, verse.number), text: verse.text }))];
}

/** One page of a section's cards for the drawing script. */
export async function listOgCards(database: D1Database, section: string, cursor: string | null) {
  const contentCategory = categoryForSection(section);
  const topic = contentCategory
    ? (await listActiveCategories(database)).find((item) => resolveContentCategoryId(item.id, item.name) === contentCategory)
    : null;
  if (!topic) return { cards: [], next: null };
  const page = await listPublicMaterialPageByCategory(database, topic.id, topic.defaultSort, cursor);
  const cards: OgCard[] = [];
  for (const item of page.materials) {
    const material = await getPublicMaterialDetail(database, item.id);
    if (material) cards.push(...cardsFor(material));
  }
  return { cards, next: page.nextCursor };
}
