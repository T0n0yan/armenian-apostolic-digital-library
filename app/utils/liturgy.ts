/**
 * Կիրակնօրյա հարցի և «Իմ ամիսը / Իմ տարին»-ի ժամանակային կանոնները։
 * Հայաստանում ժամը միշտ UTC+4 է (ամառային ժամ չկա)։
 */
const YEREVAN_MS = 4 * 3_600_000;

/** Երևանի օրը՝ YYYY-MM-DD։ */
export function yerevanDay(now = Date.now()) {
  return new Date(now + YEREVAN_MS).toISOString().slice(0, 10);
}

/**
 * Որ կիրակիի մասին է հարցը. կիրակի 13:00-ից մինչև երկուշաբթի օրվա վերջը (Երևանի ժամով)։
 * Մյուս ժամերին՝ null (հարց չկա)։
 */
export function sundayToAsk(now = Date.now()) {
  const local = new Date(now + YEREVAN_MS);
  const weekday = local.getUTCDay();
  if (weekday === 0 && local.getUTCHours() >= 13) return local.toISOString().slice(0, 10);
  if (weekday === 1) return new Date(now + YEREVAN_MS - 86_400_000).toISOString().slice(0, 10);
  return null;
}

/** «2026» → ամբողջ տարին, «2026-11» → նոյեմբերը։ Սխալ ձևի դեպքում՝ null։ */
export function periodRange(period: string) {
  const year = /^(\d{4})$/u.exec(period);
  if (year) return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31`, kind: "year" as const };
  const month = /^(\d{4})-(\d{2})$/u.exec(period);
  if (!month || Number(month[2]) < 1 || Number(month[2]) > 12) return null;
  const last = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}`, kind: "month" as const };
}

/** Ամսական քարտը երևում է ամսվա առաջին 7 օրը՝ նախորդ ամսի համար. վերադարձնում է «2026-10» կամ null։ */
export function monthToShow(now = Date.now()) {
  const local = new Date(now + YEREVAN_MS);
  if (local.getUTCDate() > 7) return null;
  const previous = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1));
  return previous.toISOString().slice(0, 7);
}

/** «Իմ տարին»-ը բաց է դեկտեմբերի 31-ից մինչև հունվարի 15-ը. վերադարձնում է տարին կամ null։ */
export function yearToShow(now = Date.now()) {
  const local = new Date(now + YEREVAN_MS);
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  if (month === 11 && day === 31) return local.getUTCFullYear();
  if (month === 0 && day <= 15) return local.getUTCFullYear() - 1;
  return null;
}

/** Ամենաերկար անընդմեջ օրերը (օրերը՝ YYYY-MM-DD, կարգը կարևոր չէ)։ */
export function longestStreak(days: string[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous = 0;
  for (const day of sorted) {
    const time = Date.parse(`${day}T00:00:00Z`);
    run = previous && time - previous === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = time;
  }
  return best;
}

/** Մինչև որ օրն են պահվում մանրամասները. փետրվարի 1-ից՝ նախորդ տարիները ջնջվում են։ */
export function archiveBefore(now = Date.now()) {
  const local = new Date(now + YEREVAN_MS);
  return local.getUTCMonth() >= 1 ? `${local.getUTCFullYear()}-01-01` : `${local.getUTCFullYear() - 1}-01-01`;
}
