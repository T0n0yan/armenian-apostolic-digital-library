import { getPublicMaterialDetail, type MaterialDetail } from "./material-detail.server";
import { canonicalMaterialPath } from "./material-page.server";
import { listPublicMaterialPageByCategory } from "./materials.server";
import { listActiveCategories } from "./categories.server";
import { categoryForSection } from "../utils/material-path";
import { clergyByline, psalmBodyText } from "../utils/material-title";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { dailyCardText } from "../utils/og-card-layout";
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

export type OgCard = { path: string; version: string; section: string; label: string; subtitle?: string; text: string; byline?: string; image?: string; plain?: boolean };

/** The cards of one material: the material itself and, for a psalm, each of its verses. */
export function cardsFor(material: MaterialDetail, origin = ""): OgCard[] {
  const path = canonicalMaterialPath(material);
  const version = ogCardVersion(material);
  const section = material.categoryName.toLocaleUpperCase("hy");
  const kind = resolveContentCategoryId(null, material.categoryName);
  // A gospel teaching: its whole name in the middle and, under it, the clergy member who gives it.
  if (kind === "category_gospel_teachings") {
    const byline = clergyByline(material.formattedText, material.formattedCaption) ?? undefined;
    return [{ path, version, section, label: material.title, text: "", byline }];
  }
  // A saint: the name alone, with the saint's icon when the post has one (no caption text).
  if (kind === "category_saints_lives") {
    const photo = material.media.find((asset) => asset.kind === "photo" && asset.url)?.url;
    const image = photo ? (photo.startsWith("/") ? `${origin}${photo}` : photo) : undefined;
    return [{ path, version, section, label: material.title, text: "", image }];
  }
  // A Bible question: the section's name as the heading, the whole question in the middle.
  if (kind === "category_bible_questions") {
    const question = (material.poll?.question.text || material.title).trim();
    return [{ path, version, section: "", label: material.categoryName, text: question, plain: true }];
  }
  // A daily reading: the date on top, the day's heading (or its readings) below, without quotes.
  if (kind === "category_daily_readings") {
    return [{ path, version, section, label: material.title, text: dailyCardText(material.contentText || material.captionText || "", material.title), plain: true }];
  }
  // Everything else: its name on top, its opening text below.
  if (kind !== "category_psalms") {
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
export async function listOgCards(database: D1Database, section: string, cursor: string | null, origin = "") {
  const contentCategory = categoryForSection(section);
  const topic = contentCategory
    ? (await listActiveCategories(database)).find((item) => resolveContentCategoryId(item.id, item.name) === contentCategory)
    : null;
  if (!topic) return { cards: [], next: null };
  const page = await listPublicMaterialPageByCategory(database, topic.id, topic.defaultSort, cursor);
  const cards: OgCard[] = [];
  for (const item of page.materials) {
    const material = await getPublicMaterialDetail(database, item.id);
    if (material) cards.push(...cardsFor(material, origin));
  }
  return { cards, next: page.nextCursor };
}
