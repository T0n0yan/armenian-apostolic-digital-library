import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { localDay } from "../utils/local-day";

type Range = "month" | "3" | "6" | "12" | "all";
const RANGES: Array<{ value: Range; label: string }> = [
  { value: "month", label: "Ամիս" },
  { value: "3", label: "3 ամիս" },
  { value: "6", label: "6 ամիս" },
  { value: "12", label: "1 տարի" },
  { value: "all", label: "Սկզբից" },
];
const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];
const WEEKDAYS = ["Երկ", "Երք", "Չոր", "Հնգ", "Ուրբ", "Շբթ", "Կիր"];

function level(count: number) {
  return count === 0 ? "bg-[rgb(160_130_90/14%)]" : count === 1 ? "bg-[rgb(217_181_111/50%)]" : count <= 3 ? "bg-[rgb(200_150_60/80%)]" : "bg-[rgb(176_125_46)]";
}

/** Days read in a month, as a calendar page with day numbers. */
function MonthView({ days, month, today }: { days: Record<string, number>; month: Date; today: string | null }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <div className="grid grid-cols-7 gap-1.5 text-center">
      {WEEKDAYS.map((name) => <span key={name} className="text-[10.5px] font-semibold text-faint">{name}</span>)}
      {Array.from({ length: lead }, (_, index) => <span key={`lead-${index}`} />)}
      {Array.from({ length: count }, (_, index) => {
        const key = localDay(new Date(month.getFullYear(), month.getMonth(), index + 1));
        const read = days[key] ?? 0;
        const future = today !== null && key > today;
        return (
          <span key={key} className={`grid aspect-square place-items-center rounded-[10px] text-[12.5px] font-semibold tabular-nums ${future ? "text-faint/50" : read ? `${level(read)} text-[#2a1708]` : "bg-[rgb(160_130_90/10%)] text-muted"} ${key === today ? "ring-2 ring-gold" : ""}`} title={read ? `${read} նյութ` : undefined}>
            {index + 1}
          </span>
        );
      })}
    </div>
  );
}

/** Weeks as columns (GitHub style) for longer ranges. */
function WeeksView({ days, weeks }: { days: Record<string, number>; weeks: number }) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7);
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1 [direction:rtl] [scrollbar-width:none]">
      {Array.from({ length: weeks }, (_, offset) => weeks - 1 - offset).map((week) => (
        <div key={week} className="grid shrink-0 grid-rows-7 gap-[3px] [direction:ltr]">
          {Array.from({ length: 7 }, (_, weekday) => {
            const date = new Date(start);
            date.setDate(start.getDate() + week * 7 + weekday);
            const key = localDay(date);
            return <span key={key} className={`block size-[12px] rounded-[3px] ${date > end ? "opacity-0" : level(days[key] ?? 0)}`} title={`${key}՝ ${days[key] ?? 0}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The reader's reading calendar: this month as a calendar page by default, or 3, 6, 12 months or
 * everything since the first reading day, with today's status and the current streak.
 */
export function ReadingCalendar({ days }: { days: Record<string, number> }) {
  const [today, setToday] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [month, setMonth] = useState(() => new Date());
  useEffect(() => setToday(localDay()), []);

  const { streak, inRange, weeks } = useMemo(() => {
    let run = 0;
    const cursor = new Date();
    if (!days[localDay(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (days[localDay(cursor)]) { run += 1; cursor.setDate(cursor.getDate() - 1); }
    const keys = Object.keys(days).sort();
    let from: string;
    if (range === "month") {
      from = localDay(new Date(month.getFullYear(), month.getMonth(), 1));
      const to = localDay(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      return { streak: run, inRange: keys.filter((key) => key >= from && key <= to).length, weeks: 0 };
    }
    const since = new Date();
    if (range === "all") {
      const firstDay = keys[0] ? new Date(`${keys[0]}T12:00:00`) : new Date();
      from = localDay(firstDay);
      return { streak: run, inRange: keys.length, weeks: Math.max(4, Math.ceil((Date.now() - firstDay.getTime()) / (7 * 86_400_000)) + 1) };
    }
    since.setMonth(since.getMonth() - Number(range));
    from = localDay(since);
    return { streak: run, inRange: keys.filter((key) => key >= from).length, weeks: Math.ceil(Number(range) * 4.35) };
  }, [days, month, range]);

  const readToday = today ? Boolean(days[today]) : false;
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();
  const shift = (by: number) => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + by, 1));
  return (
    <section className="frosted-panel grid gap-3 px-4 py-4" aria-label="Ընթերցանության օրացույց">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <strong className="text-[14.5px] text-ink">{readToday ? "Այսօր կարդացել եք ✓" : "Այսօր դեռ չեք կարդացել"}</strong>
          <span className="text-[12px] text-muted">{inRange} օր {range === "month" ? "այս ամսում" : range === "all" ? "ընդհանուր" : `վերջին ${range} ամսում`}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] px-3 py-1.5 text-[13px] font-bold text-gold-bright" title="Անընդմեջ օրեր">
          <Flame aria-hidden="true" size={15} /> {streak}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1 rounded-[13px] bg-subtle p-1" role="radiogroup" aria-label="Ժամանակահատված">
        {RANGES.map((option) => (
          <button key={option.value} className={`min-h-8 cursor-pointer rounded-[9px] border-0 text-[11.5px] font-semibold ${range === option.value ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`} type="button" role="radio" aria-checked={range === option.value} onClick={() => setRange(option.value)}>{option.label}</button>
        ))}
      </div>
      {range === "month" ? (
        <>
          <div className="flex items-center justify-between">
            <button className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-gold-bright" type="button" onClick={() => shift(-1)} aria-label="Նախորդ ամիս"><ChevronLeft aria-hidden="true" size={18} /></button>
            <strong className="text-[13.5px] text-ink">{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
            <button className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-gold-bright disabled:opacity-30" type="button" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Հաջորդ ամիս"><ChevronRight aria-hidden="true" size={18} /></button>
          </div>
          <MonthView days={days} month={month} today={today} />
        </>
      ) : (
        <WeeksView days={days} weeks={weeks} />
      )}
      <p className="m-0 text-[11.5px] leading-snug text-faint">Օրը նշվում է, երբ նյութը կարդում եք առնվազն մեկ րոպե, ձայնագրությունը լսում եք մինչև վերջ կամ պատասխանում եք հարցին։</p>
    </section>
  );
}
