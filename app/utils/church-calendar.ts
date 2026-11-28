// Տոնացույց և պահքի օրեր (/church/calendar)։ Օրերը հաշվվում են Զատկից (`easterDay`) և հաստատուն
// ամսաթվերից, իսկ ադմինը ձեռքով ավելացնում կամ թաքցնում է՝ ըստ Մայր Աթոռի տարեկան տոնացույցի
// (`calendar_days`, migration 0061)։ ⚑ Ճշտել. ամբողջ հաշվարկը պետք է ստուգի քահանան։
import { formatDayMonth } from "./armenian-date";
import { easterDay } from "./liturgy";

export type CalendarKind = "taghavar" | "feast" | "memorial" | "fast";
export type CalendarEntry = { day: string; title: string; kind: CalendarKind; manual?: boolean; id?: number };
export type FastPeriod = { from: string; to: string; title: string };
/** Ադմինի ձեռքով ուղղումը. hide՝ թաքցնել հաշվարկված տողը (նույն օր և վերնագիր)։ */
export type CalendarOverride = { id: number; day: string; title: string; kind: CalendarKind; hide: boolean };

export const CALENDAR_KINDS: Record<CalendarKind, { label: string; className: string }> = {
  taghavar: { label: "Տաղավար տոն", className: "bg-[rgb(217_181_111/20%)] text-gold-bright" },
  feast: { label: "Տոն", className: "bg-[rgb(217_181_111/12%)] text-gold-bright" },
  memorial: { label: "Հիշատակ", className: "bg-[rgb(120_110_95/14%)] text-muted" },
  fast: { label: "Պահք", className: "bg-[rgb(61_118_80/14%)] text-success" },
};
export const isCalendarKind = (value: unknown): value is CalendarKind => typeof value === "string" && value in CALENDAR_KINDS;

const DAY_MS = 86_400_000;
export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const pad = (value: number) => String(value).padStart(2, "0");

/** Ամսաթվին ամենամոտ կիրակին (−3…+3 օր)։ */
export function nearestSunday(year: number, month: number, date: number) {
  const day = `${year}-${pad(month)}-${pad(date)}`;
  const offset = weekday(day);
  return addDays(day, offset <= 3 ? -offset : 7 - offset);
}

/** Տարվա հաշվարկված տոները (առանց ձեռքով ուղղումների)։ */
export function computedFeasts(year: number): CalendarEntry[] {
  const easter = easterDay(year);
  const e = (days: number) => addDays(easter, days);
  const assumption = nearestSunday(year, 8, 15);
  const cross = nearestSunday(year, 9, 14);
  const list: Array<[string, string, CalendarKind]> = [
    [`${year}-01-05`, "Ճրագալույց Սուրբ Ծննդյան", "feast"],
    [`${year}-01-06`, "Սուրբ Ծնունդ և Աստվածահայտնություն", "taghavar"],
    [`${year}-01-07`, "Մեռելոց", "memorial"],
    [`${year}-02-14`, "Տյառնընդառաջ", "feast"],
    [`${year}-04-07`, "Ավետում", "feast"],
    [e(-52), "Սուրբ Վարդանանց", "feast"],
    [e(-49), "Մեծ պահքի Բարեկենդան", "feast"],
    [e(-7), "Ծաղկազարդ", "feast"],
    [e(-3), "Ավագ Հինգշաբթի", "feast"],
    [e(-2), "Ավագ Ուրբաթ", "feast"],
    [e(-1), "Ճրագալույց Զատկի", "feast"],
    [easter, "Սուրբ Զատիկ", "taghavar"],
    [e(1), "Մեռելոց", "memorial"],
    [e(7), "Նոր կիրակի (Կրկնազատիկ)", "feast"],
    [e(39), "Համբարձում", "feast"],
    [e(49), "Հոգեգալուստ", "feast"],
    [e(98), "Պայծառակերպություն (Վարդավառ)", "taghavar"],
    [e(99), "Մեռելոց", "memorial"],
    [assumption, "Աստվածածնի Վերափոխում և Խաղողօրհնեք", "taghavar"],
    [addDays(assumption, 1), "Մեռելոց", "memorial"],
    [cross, "Խաչվերաց", "taghavar"],
    [addDays(cross, 1), "Մեռելոց", "memorial"],
  ];
  return list.filter(([day]) => day.startsWith(`${year}-`)).map(([day, title, kind]) => ({ day, title, kind }));
}

/** Պահքի շրջանները (առանց չորեքշաբթի/ուրբաթի)։ */
export function fastPeriods(year: number): FastPeriod[] {
  const easter = easterDay(year);
  const e = (days: number) => addDays(easter, days);
  const weekBefore = (sunday: string, title: string): FastPeriod => ({ from: addDays(sunday, -6), to: addDays(sunday, -2), title });
  return [
    { from: `${year}-01-01`, to: `${year}-01-05`, title: "Ծննդյան պահք" },
    { from: e(-69), to: e(-65), title: "Առաջավորաց պահք" },
    { from: e(-48), to: e(-1), title: "Մեծ պահք" },
    weekBefore(e(98), "Վարդավառի շաբաթապահք"),
    weekBefore(nearestSunday(year, 8, 15), "Վերափոխման շաբաթապահք"),
    weekBefore(nearestSunday(year, 9, 14), "Խաչվերացի շաբաթապահք"),
    { from: `${year}-12-30`, to: `${year}-12-31`, title: "Ծննդյան պահք" },
  ];
}

/** Պահքի օր է, թե ոչ, և ինչու։ Չորեքշաբթի/ուրբաթը պահք չէ Զատկից Հոգեգալուստ և Ծննդից ութ օր։ */
export function fastOn(day: string, periods = fastPeriods(Number(day.slice(0, 4)))): string | null {
  const period = periods.find((item) => item.from <= day && day <= item.to);
  if (period) return period.title;
  const year = Number(day.slice(0, 4));
  const easter = easterDay(year);
  if (day >= easter && day <= addDays(easter, 49)) return null;
  if (day >= `${year}-01-06` && day <= `${year}-01-13`) return null;
  const week = weekday(day);
  return week === 3 ? "Չորեքշաբթի" : week === 5 ? "Ուրբաթ" : null;
}

/** Տարվա բոլոր տոները՝ ձեռքով ուղղումներով, ամսաթվի կարգով։ */
export function yearFeasts(year: number, overrides: CalendarOverride[] = []): CalendarEntry[] {
  const hidden = new Set(overrides.filter((item) => item.hide).map((item) => `${item.day}|${item.title}`));
  const manual = overrides.filter((item) => !item.hide && item.day.startsWith(`${year}-`))
    .map(({ id, day, title, kind }) => ({ id, day, title, kind, manual: true }));
  return [...computedFeasts(year).filter((entry) => !hidden.has(`${entry.day}|${entry.title}`)), ...manual]
    .sort((left, right) => left.day.localeCompare(right.day));
}

/** «Այսօր» տողը. տոները և պահքը (եթե կա)։ */
export function todayLine(day: string, overrides: CalendarOverride[] = []) {
  const feasts = yearFeasts(Number(day.slice(0, 4)), overrides).filter((entry) => entry.day === day && entry.kind !== "fast");
  const manualFast = overrides.find((item) => !item.hide && item.day === day && item.kind === "fast");
  const hiddenFast = overrides.some((item) => item.hide && item.day === day && item.kind === "fast");
  const fast = manualFast?.title ?? (hiddenFast ? null : fastOn(day));
  return { day, feasts: feasts.map((entry) => entry.title), fast };
}

export const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];
export const WEEKDAYS = ["Կիրակի", "Երկուշաբթի", "Երեքշաբթի", "Չորեքշաբթի", "Հինգշաբթի", "Ուրբաթ", "Շաբաթ"];
export const weekdayName = (day: string) => WEEKDAYS[weekday(day)];
/** «6 հունվարի»՝ YYYY-MM-DD-ից (տեղական ժամային գոտին չի ազդում)։ */
export const dayMonth = (day: string) => formatDayMonth(new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))));
