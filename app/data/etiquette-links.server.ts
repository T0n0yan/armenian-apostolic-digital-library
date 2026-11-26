// «Վարք եկեղեցում»-ի կանոններին կցված հղումները (migration 0054)։

export type EtiquetteLink = { id: number; ruleId: string; url: string; title: string };

export const LINK_LIMITS = { url: 600, title: 120, perRule: 12 };

export async function listEtiquetteLinks(database: D1Database, topic: string): Promise<EtiquetteLink[]> {
  const { results } = await database.prepare("SELECT id, rule_id, url, title FROM etiquette_links WHERE topic = ? ORDER BY id")
    .bind(topic).all<{ id: number; rule_id: string; url: string; title: string }>();
  return results.map((row) => ({ id: row.id, ruleId: row.rule_id, url: row.url, title: row.title }));
}

export async function countRuleLinks(database: D1Database, topic: string, ruleId: string) {
  const row = await database.prepare("SELECT COUNT(*) AS total FROM etiquette_links WHERE topic = ? AND rule_id = ?").bind(topic, ruleId).first<{ total: number }>();
  return row?.total ?? 0;
}

export async function addEtiquetteLink(database: D1Database, link: { topic: string; ruleId: string; url: string; title: string; userId: string }) {
  await database.prepare("INSERT INTO etiquette_links (topic, rule_id, url, title, created_by) VALUES (?, ?, ?, ?, ?)")
    .bind(link.topic, link.ruleId, link.url, link.title, link.userId).run();
}

export async function deleteEtiquetteLink(database: D1Database, id: number) {
  await database.prepare("DELETE FROM etiquette_links WHERE id = ?").bind(id).run();
}

/** Միայն http(s) հասցե, առանց բացատների։ */
export function cleanLinkUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > LINK_LIMITS.url) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}
