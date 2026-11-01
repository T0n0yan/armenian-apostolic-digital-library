/**
 * Կիրակնօրյա հարցի և «Իմ ամիսը / Իմ տարին»-ի ժամանակային կանոնները։
 * Հայաստանում ժամը միշտ UTC+4 է (ամառային ժամ չկա)։
 */
const YEREVAN_MS = 4 * 3_600_000;

/** Երևանի օրը՝ YYYY-MM-DD։ */
export function yerevanDay(now = Date.now()) {
  return new Date(now + YEREVAN_MS).toISOString().slice(0, 10);
}

/** Զատկի օրը (Գրիգորյան օրացույց, ինչպես Հայ Առաքելական Եկեղեցում)՝ YYYY-MM-DD։ */
export function easterDay(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Մեծ տոներ, որոնք կարող են լինել ոչ կիրակի (կիրակիները առանց այդ էլ հարցվում են)։
 * ⚑ Ճշտել հոգևորականի հետ։
 */
export function feastOn(day: string): string | null {
  const year = Number(day.slice(0, 4));
  const fixed: Record<string, string> = { "01-06": "Սուրբ Ծնունդ և Աստվածահայտնություն", "02-14": "Տեառնընդառաջ", "04-07": "Ավետում" };
  if (fixed[day.slice(5)]) return fixed[day.slice(5)];
  const easter = easterDay(year);
  if (day === shift(easter, -3)) return "Ավագ Հինգշաբթի";
  if (day === shift(easter, 39)) return "Համբարձում";
  return null;
}

/** Արդյոք այդ օրը հարցնում ենք Պատարագի մասին (կիրակի կամ մեծ տոն)։ */
export function isLiturgyDay(day: string) {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0 || feastOn(day) !== null;
}

/**
 * Որ օրվա մասին է հարցը. կիրակի (կամ մեծ տոն) 13:00-ից մինչև հաջորդ օրվա վերջը (Երևանի ժամով)։
 * Մյուս ժամերին՝ null (հարց չկա)։
 */
export function sundayToAsk(now = Date.now()) {
  const local = new Date(now + YEREVAN_MS);
  const today = local.toISOString().slice(0, 10);
  if (local.getUTCHours() >= 13 && isLiturgyDay(today)) return today;
  const yesterday = shift(today, -1);
  return isLiturgyDay(yesterday) ? yesterday : null;
}

/** Ձեռքով կարելի է նշել այսօրը և վերջին 30 օրը (ոչ ապագա)։ */
export function canMarkDay(day: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return false;
  const today = yerevanDay(now);
  return day <= today && day >= shift(today, -30);
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
