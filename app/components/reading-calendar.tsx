import { BookOpenCheck, ChevronLeft, ChevronRight, CircleHelp, Flame, Headphones, LoaderCircle, MonitorPlay } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { materialPath } from "../utils/material-path";

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
function MonthView({ days, month, today, selected, onSelect }: { days: Record<string, number>; month: Date; today: string | null; selected: string | null; onSelect: (day: string) => void }) {
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
          <button key={key} type="button" disabled={future} onClick={() => onSelect(key)} aria-pressed={key === selected}
            className={`grid aspect-square cursor-pointer place-items-center rounded-[10px] border-0 p-0 text-[12.5px] font-semibold tabular-nums transition-transform active:scale-95 disabled:cursor-default min-[860px]:text-[13.5px] ${future ? "bg-transparent text-faint/50" : read ? `${level(read)} text-[#2a1708]` : "bg-[rgb(160_130_90/10%)] text-muted"} ${key === selected ? "ring-2 ring-gold ring-offset-2 ring-offset-[var(--page-bg)]" : key === today ? "ring-1 ring-gold/70" : ""}`}
            title={read ? `${read} նյութ` : undefined}>
            {index + 1}
          </button>
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

type Entry = { materialId: string; kind: "read" | "listen" | "watch" | "quiz"; title: string; categoryName: string | null };
const ENTRY_TEXT: Record<Entry["kind"], { verb: string; icon: typeof Flame }> = {
  read: { verb: "Կարդացել եք", icon: BookOpenCheck },
  listen: { verb: "Լսել եք", icon: Headphones },
  watch: { verb: "Դիտել եք", icon: MonitorPlay },
  quiz: { verb: "Պատասխանել եք", icon: CircleHelp },
};

function dayTitle(day: string, today: string | null) {
  if (day === today) return "Այսօր";
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1].toLowerCase()}${year !== new Date().getFullYear() ? ` ${year}` : ""}`;
}

/** What the reader read, listened to or watched on the chosen day. */
function DayEntries({ day, today, count }: { day: string; today: string | null; count: number }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    let active = true;
    setEntries(null);
    fetch(`/api/reading-log?day=${day}`, { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<{ entries: Entry[] }> : { entries: [] })
      .then((data) => { if (active) setEntries(data.entries); })
      .catch(() => { if (active) setEntries([]); });
    return () => { active = false; };
  }, [day, count]);
  return (
    <div className="grid content-start gap-2 rounded-[16px] bg-subtle p-3">
      <strong className="px-1 text-[13px] text-ink">{dayTitle(day, today)}</strong>
      {entries === null ? (
        <span className="flex items-center gap-2 px-1 py-2 text-[12.5px] text-muted"><LoaderCircle className="animate-search-spin" aria-hidden="true" size={15} /> Բեռնվում է…</span>
      ) : entries.length === 0 ? (
        <span className="px-1 py-1 text-[12.5px] leading-snug text-muted">Այս օրը նշված նյութ չկա։ Նյութի էջում սեղմեք «Կարդացել եմ», «Լսել եմ» կամ «Դիտել եմ»։</span>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {entries.map((entry) => {
            const { verb, icon: Icon } = ENTRY_TEXT[entry.kind];
            return (
              <li key={entry.materialId}>
                <Link className="grid grid-cols-[30px_1fr] items-center gap-2.5 rounded-[12px] px-1.5 py-1.5 text-inherit no-underline hover:bg-glass-strong" to={materialPath(entry.materialId, entry.categoryName)}>
                  <span className="grid size-[30px] place-items-center rounded-full bg-[rgb(217_181_111/14%)] text-gold-bright"><Icon aria-hidden="true" size={15} /></span>
                  <span className="grid min-w-0">
                    <span className="text-[11px] font-semibold text-muted">{verb}{entry.categoryName ? ` · ${entry.categoryName}` : ""}</span>
                    <strong className="truncate text-[13px] text-ink">{entry.title}</strong>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The reader's reading calendar: this month as a calendar page by default, or 3, 6, 12 months or
 * everything since the first reading day, with today's status and the current streak.
 */
/** Longer views only once the account is old enough for them to show more than emptiness. */
const RANGE_MIN_DAYS: Record<Range, number> = { month: 0, "3": 60, "6": 150, "12": 300, all: 60 };

export function ReadingCalendar({ days, joinedAt }: { days: Record<string, number>; joinedAt: string | null }) {
  const [today, setToday] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const day = localDay(); setToday(day); setSelected(day); }, []);

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
      const firstDay = joinedAt ? new Date(joinedAt) : keys[0] ? new Date(`${keys[0]}T12:00:00`) : new Date();
      from = localDay(firstDay);
      return { streak: run, inRange: keys.length, weeks: Math.max(4, Math.ceil((Date.now() - firstDay.getTime()) / (7 * 86_400_000)) + 1) };
    }
    since.setMonth(since.getMonth() - Number(range));
    from = localDay(since);
    return { streak: run, inRange: keys.filter((key) => key >= from).length, weeks: Math.ceil(Number(range) * 4.35) };
  }, [days, joinedAt, month, range]);

  const joined = joinedAt ? new Date(joinedAt) : null;
  const joinedDay = joined ? localDay(joined) : null;
  const ageDays = joined ? Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86_400_000)) : 9999;
  const ranges = RANGES.filter((option) => ageDays >= RANGE_MIN_DAYS[option.value]);
  // Days since joining (today included) and how many of them had a reading.
  const sinceJoined = joinedDay ? Object.keys(days).filter((key) => key >= joinedDay).length : 0;
  const totalDays = ageDays + 1;
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
      {joined ? (
        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 rounded-[12px] bg-subtle px-3 py-2 text-[12px] text-muted">
          <span>Գրանցվել եք՝ <strong className="font-semibold text-ink">{joined.getDate()} {MONTHS[joined.getMonth()].toLowerCase()} {joined.getFullYear()}</strong></span>
          <span>Կարդացել եք՝ <strong className="font-semibold text-[rgb(52_130_74)]">{sinceJoined} օր</strong></span>
          <span>Չեք կարդացել՝ <strong className="font-semibold text-ink">{Math.max(0, totalDays - sinceJoined)} օր</strong></span>
        </p>
      ) : null}
      {ranges.length > 1 ? (
      <div className="grid gap-1 rounded-[13px] bg-subtle p-1" style={{ gridTemplateColumns: `repeat(${ranges.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Ժամանակահատված">
        {ranges.map((option) => (
          <button key={option.value} className={`min-h-8 cursor-pointer rounded-[9px] border-0 text-[11.5px] font-semibold ${range === option.value ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`} type="button" role="radio" aria-checked={range === option.value} onClick={() => setRange(option.value)}>{option.label}</button>
        ))}
      </div>
      ) : null}
      {range === "month" ? (
        <>
          {/* Phones: the day's list under the calendar; tablets and computers: side by side. */}
          <div className="grid gap-3 min-[860px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] min-[860px]:items-start min-[860px]:gap-5">
            <div className="mx-auto grid w-full max-w-[460px] gap-2">
              <div className="flex items-center justify-between">
                <button className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-gold-bright" type="button" onClick={() => shift(-1)} aria-label="Նախորդ ամիս"><ChevronLeft aria-hidden="true" size={18} /></button>
                <strong className="text-[13.5px] text-ink">{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
                <button className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-gold-bright disabled:opacity-30" type="button" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Հաջորդ ամիս"><ChevronRight aria-hidden="true" size={18} /></button>
              </div>
              <MonthView days={days} month={month} today={today} selected={selected} onSelect={setSelected} />
            </div>
            {selected ? <DayEntries day={selected} today={today} count={days[selected] ?? 0} /> : null}
          </div>
        </>
      ) : (
        <WeeksView days={days} weeks={weeks} />
      )}
      <p className="m-0 text-[11.5px] leading-snug text-faint">Օրը նշվում է, երբ նյութի էջում սեղմում եք «Կարդացել եմ», «Լսել եմ» կամ «Դիտել եմ», կամ պատասխանում եք հարցին։ Սեղմեք օրվա վրա՝ տեսնելու, թե ինչ եք կարդացել։</p>
    </section>
  );
}
