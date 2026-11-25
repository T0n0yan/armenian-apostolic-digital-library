import { matchSearchableText, parseTelegramSearchQuery } from "../../shared/telegram-search";
import { CHURCH_SECTIONS } from "../data/church";
import { ETIQUETTE_TOPICS } from "../data/etiquette";

export type EtiquetteHit = { href: string; title: string; text: string; topic: string; rank: number };

/**
 * «Վարք եկեղեցում»-ի որոնում՝ նույն կանոններով, ինչ կայքի որոնումը (վերջավորություններ,
 * դասական ուղղագրություն, լատինատառ)։ Վերնագրում գտնվածը առաջ է։
 */
export function searchEtiquette(query: string, limit = 20): EtiquetteHit[] {
  const parsed = parseTelegramSearchQuery(query);
  if (!parsed.normalized) return [];
  const hits: EtiquetteHit[] = [];
  const score = (title: string, ...rest: Array<string | undefined>) =>
    matchSearchableText(title, parsed) ? 2 : rest.some((value) => value && matchSearchableText(value, parsed)) ? 1 : 0;
  for (const topic of ETIQUETTE_TOPICS) {
    if (topic.status === "soon") continue;
    const base = `/church/etiquette/${topic.slug}`;
    for (const rule of topic.rules) {
      const rank = score(rule.title, rule.what, rule.why, topic.title);
      if (rank) hits.push({ href: `${base}#${rule.id}`, title: rule.title, text: rule.what, topic: topic.title, rank });
    }
    for (const [index, item] of (topic.faq ?? []).entries()) {
      const rank = score(item.q, item.a);
      if (rank) hits.push({ href: `${base}#faq-${index}`, title: item.q, text: item.a, topic: topic.title, rank });
    }
  }
  // Ուղեցույցի էջերը (Հիշատակության օրեր և այլն)։
  for (const section of CHURCH_SECTIONS) {
    if (section.status === "soon" || !section.guide) continue;
    for (const block of section.guide.blocks) {
      const rank = score(block.title, block.text, block.when, block.why, section.title);
      if (rank) hits.push({ href: `/church/${section.slug}#${block.id}`, title: block.title, text: block.text, topic: section.title, rank });
    }
  }
  return hits.sort((left, right) => right.rank - left.rank).slice(0, limit);
}
