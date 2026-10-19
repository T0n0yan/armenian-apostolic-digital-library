import { Flame } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { localDay } from "../utils/local-day";

const WEEKS = 18;
const WEEKDAY_LABELS = ["Երկ", "", "Չոր", "", "Ուրբ", "", "Կիր"];

/**
 * A GitHub-style calendar of the days the reader read (a material open for a minute, a
 * recording heard to the end, a quiz answered), with today's status and the current streak.
 */
export function ReadingCalendar({ days }: { days: Record<string, number> }) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDay()), []);

  const { columns, streak, total } = useMemo(() => {
    const end = new Date();
    // Columns are weeks Monday–Sunday, ending with the current week.
    const offset = (end.getDay() + 6) % 7;
    const start = new Date(end);
    start.setDate(end.getDate() - offset - (WEEKS - 1) * 7);
    const cols: Array<Array<{ key: string; count: number; future: boolean }>> = [];
    for (let week = 0; week < WEEKS; week += 1) {
      const column = [];
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + week * 7 + weekday);
        const key = localDay(date);
        column.push({ key, count: days[key] ?? 0, future: date > end });
      }
      cols.push(column);
    }
    let run = 0;
    const cursor = new Date(end);
    if (!days[localDay(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (days[localDay(cursor)]) { run += 1; cursor.setDate(cursor.getDate() - 1); }
    return { columns: cols, streak: run, total: Object.keys(days).length };
  }, [days]);

  const readToday = today ? Boolean(days[today]) : false;
  const level = (count: number) => count === 0 ? "bg-[rgb(160_130_90/14%)]" : count === 1 ? "bg-[rgb(217_181_111/45%)]" : count <= 3 ? "bg-[rgb(200_150_60/75%)]" : "bg-[rgb(176_125_46)]";
  return (
    <section className="frosted-panel grid gap-3 px-4 py-4" aria-label="Ընթերցանության օրացույց">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <strong className="text-[14.5px] text-ink">{readToday ? "Այսօր կարդացել եք ✓" : "Այսօր դեռ չեք կարդացել"}</strong>
          <span className="text-[12px] text-muted">{total} օր վերջին ամիսներին</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] px-3 py-1.5 text-[13px] font-bold text-gold-bright" title="Անընդմեջ օրեր">
          <Flame aria-hidden="true" size={15} /> {streak}
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pr-0.5 text-[9px] leading-[13px] text-faint" aria-hidden="true">
          {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        {columns.map((column, index) => (
          <div key={index} className="grid shrink-0 grid-rows-7 gap-[3px]">
            {column.map((cell) => (
              <span key={cell.key} className={`block size-[13px] rounded-[3px] ${cell.future ? "opacity-0" : level(cell.count)} ${cell.key === today ? "ring-1 ring-gold" : ""}`} title={`${cell.key}՝ ${cell.count}`} />
            ))}
          </div>
        ))}
      </div>
      <p className="m-0 text-[11.5px] leading-snug text-faint">Օրը նշվում է, երբ նյութը կարդում եք առնվազն մեկ րոպե, ձայնագրությունը լսում եք մինչև վերջ կամ պատասխանում եք հարցին։</p>
    </section>
  );
}
