import type { GlossaryTerm } from "../utils/glossary";

/** Բառարանի բառերը բազայից։ */
type Row = { id: number; word: string; forms_json: string; meaning: string; note: string; verified: number };

const forms = (json: string) => {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
};

/** Բոլոր բառերը՝ այբբենական կարգով։ */
export async function listGlossary(db: D1Database): Promise<GlossaryTerm[]> {
  const { results } = await db.prepare("SELECT id, word, forms_json, meaning, note, verified FROM glossary_terms ORDER BY word COLLATE NOCASE").all<Row>();
  return results.map((row) => ({ id: row.id, word: row.word, forms: forms(row.forms_json), meaning: row.meaning, note: row.note, verified: Boolean(row.verified) }));
}

/** «ձև1, ձև2» տողից՝ ձևերի ցուցակ (կրկնվողներն ու դատարկները հանված)։ */
export function parseForms(text: string) {
  return [...new Set(text.split(/[,،\n]/u).map((item) => item.trim()).filter((item) => item.length >= 2))].slice(0, 30);
}

/** Նոր բառ կամ եղածի փոփոխություն (id-ով)։ */
export async function saveGlossaryTerm(db: D1Database, term: { id?: number; word: string; forms: string[]; meaning: string; note: string; verified: boolean }) {
  const values = [term.word, JSON.stringify(term.forms), term.meaning, term.note, term.verified ? 1 : 0];
  if (term.id) {
    await db.prepare("UPDATE glossary_terms SET word = ?, forms_json = ?, meaning = ?, note = ?, verified = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(...values, term.id).run();
    return term.id;
  }
  const row = await db.prepare("INSERT INTO glossary_terms (word, forms_json, meaning, note, verified) VALUES (?, ?, ?, ?, ?) RETURNING id").bind(...values).first<{ id: number }>();
  return row?.id ?? null;
}

export function deleteGlossaryTerm(db: D1Database, id: number) {
  return db.prepare("DELETE FROM glossary_terms WHERE id = ?").bind(id).run();
}
