import { isCalendarKind, type CalendarKind, type CalendarOverride } from "../utils/church-calendar";

type Row = { id: number; day: string; title: string; kind: string; hide: number };

/** Տարվա ձեռքով ուղղումները (year չտալիս՝ բոլորը)։ */
export async function listOverrides(db: D1Database, year?: number): Promise<CalendarOverride[]> {
  const query = year
    ? db.prepare("SELECT id, day, title, kind, hide FROM calendar_days WHERE day LIKE ? ORDER BY day, id").bind(`${year}-%`)
    : db.prepare("SELECT id, day, title, kind, hide FROM calendar_days ORDER BY day, id");
  const { results } = await query.all<Row>();
  return results.map((row) => ({ id: row.id, day: row.day, title: row.title, kind: isCalendarKind(row.kind) ? row.kind : "feast", hide: row.hide === 1 }));
}

export function addOverride(db: D1Database, input: { day: string; title: string; kind: CalendarKind; hide: boolean }, userId: string) {
  return db.prepare("INSERT INTO calendar_days (day, title, kind, hide, updated_by) VALUES (?, ?, ?, ?, ?)")
    .bind(input.day, input.title, input.kind, input.hide ? 1 : 0, userId).run();
}

export function deleteOverride(db: D1Database, id: number) {
  return db.prepare("DELETE FROM calendar_days WHERE id = ?").bind(id).run();
}
