import { BellRing, Check, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";

import { CategoryIcon } from "./category-icon";
import { REMINDER_RINGING_EVENT, dismissReminder, markReminderDone, useActiveReminders, useMissedReminders } from "../utils/reminder-store";
import { ReminderButton } from "./reminder-button";
import { materialPath } from "../utils/material-path";
import { formatClock, formatDayMonth } from "../utils/armenian-date";

const REPEAT_TEXT: Record<string, string> = { daily: "ամեն օր", weekly: "ամեն շաբաթ", monthly: "ամեն ամիս", yearly: "ամեն տարի" };

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const time = formatClock(date);
  if (date.toDateString() === today.toDateString()) return `այսօր ${time}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (date.toDateString() === tomorrow.toDateString()) return `վաղը ${time}`;
  return `${formatDayMonth(date)}, ${time}`;
}

const cardAction = "grid size-8 cursor-pointer place-items-center rounded-full border transition-transform active:scale-90";

/** One rung reminder: open it, mark it read (✓), set it again (bell) or remove it (trash). */
function MissedCard({ item, opening, onOpen }: { item: { materialId: string; rangAt: string; title: string; categoryName: string | null }; opening: boolean; onOpen: () => void }) {
  return (
    <div className={`relative z-[2] grid grid-cols-[1fr_auto] items-center gap-2 rounded-[14px] border border-glass-border bg-[var(--page-bg)] px-1.5 py-1.5 shadow-[0_6px_18px_rgb(0_0_0/18%)] transition-colors ${opening ? "bg-[rgb(217_181_111/14%)]" : ""}`}>
      <Link className="relative z-[3] grid min-w-0 grid-cols-[30px_1fr] items-center gap-2.5 rounded-[10px] px-1 py-0.5 text-inherit no-underline hover:bg-subtle active:scale-[.98]" to={materialPath(item.materialId, item.categoryName, { title: item.title })} onClick={onOpen} aria-busy={opening}>
        <ItemIcon categoryName={item.categoryName} busy={opening} />
        <span className="grid min-w-0">
          <strong className="truncate text-[13px] text-ink">{item.title}</strong>
          <span className="text-[11.5px] text-muted">{opening ? "Բացվում է…" : formatWhen(item.rangAt)}</span>
        </span>
      </Link>
      <span className="relative z-[3] flex items-center gap-1">
        <button className={`${cardAction} border-[rgb(74_160_96/45%)] bg-[rgb(74_160_96/12%)] text-[rgb(52_130_74)]`} type="button" onClick={() => void markReminderDone(item.materialId)} aria-label="Կարդացել եմ" title="Կարդացել եմ"><Check aria-hidden="true" size={15} strokeWidth={2.4} /></button>
        <ReminderButton className={`${cardAction} border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/10%)] text-gold-bright`} materialId={item.materialId} title={item.title} />
        <button className={`${cardAction} border-[rgb(205_70_55/35%)] bg-[rgb(205_70_55/10%)] text-[rgb(190_70_55)]`} type="button" onClick={() => void dismissReminder(item.materialId)} aria-label="Հեռացնել ծանուցումը" title="Հեռացնել"><Trash2 aria-hidden="true" size={14} /></button>
      </span>
    </div>
  );
}

function ItemIcon({ categoryName, busy }: { categoryName: string | null; busy: boolean }) {
  return (
    <span className="grid size-[30px] place-items-center rounded-full bg-[rgb(217_181_111/12%)] text-gold-bright">
      {busy ? <LoaderCircle className="animate-search-spin" aria-hidden="true" size={16} /> : <CategoryIcon categoryId="" categoryName={categoryName} size={16} />}
    </span>
  );
}

/**
 * A bell sitting right above the menu button (inside the menu's corner) while the reader has reminders; tapping it lists them.
 * When a reminder rings it swings left and right and settles.
 */
export function ReminderIndicator({ hidden = false }: { hidden?: boolean }) {
  const reminders = useActiveReminders();
  const missed = useMissedReminders();
  const [open, setOpen] = useState(false);
  const [swinging, setSwinging] = useState(false);
  // The item being opened stays highlighted with a spinner until its page has opened.
  const [opening, setOpening] = useState<string | null>(null);
  const location = useLocation();
  const [stackOpen, setStackOpen] = useState(false);
  useEffect(() => { setOpening(null); setOpen(false); }, [location.pathname]);

  useEffect(() => {
    let timer = 0;
    const swing = () => {
      setSwinging(false);
      requestAnimationFrame(() => setSwinging(true));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSwinging(false), 1_800);
    };
    window.addEventListener(REMINDER_RINGING_EVENT, swing);
    return () => { window.removeEventListener(REMINDER_RINGING_EVENT, swing); window.clearTimeout(timer); };
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ bottom: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      // The scheduling sheet opened from an item sits over the page; using it keeps the list open.
      if ((target as Element).closest?.('[role="dialog"]:not([aria-label="Հիշեցումներ"])')) return;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (reminders.length === 0 && missed.length === 0) return null;
  const count = missed.length || reminders.length;
  return (
    <div className={`pointer-events-auto mr-2 mb-2.5 transition-opacity duration-200 ${hidden ? "hidden" : "opacity-100"}`} ref={rootRef}>
      <button
        className={`relative grid size-[46px] cursor-pointer place-items-center rounded-full border border-[var(--fab-border)] bg-[var(--fab-bg)] text-gold-bright shadow-[var(--fab-shadow)] backdrop-blur-xl ${swinging ? "bell-swing" : ""}`}
        type="button"
        onClick={(event) => {
          // The list is drawn over the page (a portal), so cards below can't cover it.
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ bottom: window.innerHeight - rect.top + 8, right: Math.max(16, window.innerWidth - rect.right) });
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-label={`Հիշեցումներ՝ ${count}`}
        title="Հիշեցումներ"
      >
        <BellRing aria-hidden="true" size={20} strokeWidth={1.9} />
        <span className={`absolute -top-1 -right-1 grid min-w-[17px] place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-1 text-[10px] font-bold leading-[17px] ${missed.length ? "bg-[rgb(205_70_55)] !bg-none text-white" : "text-[#2a1708]"}`}>{count}</span>
      </button>
      {open && anchor ? createPortal(
        <div ref={listRef} style={{ bottom: anchor.bottom, right: anchor.right }} className="fixed z-[75] grid w-[min(380px,calc(100vw-24px))] gap-1 rounded-[18px] border border-glass-border bg-[var(--page-bg)] p-2 text-left shadow-[0_18px_44px_rgb(40_20_10/25%)]" role="dialog" aria-label="Հիշեցումներ">
          {missed.length ? (
            <>
              <span className="flex items-center justify-between px-2 pt-1 pb-1.5">
                <span className="text-[11px] font-bold tracking-[0.4px] text-[rgb(205_70_55)] uppercase">Ժամանակն է կարդալու</span>
                {missed.length > 1 && stackOpen ? <button className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-muted" type="button" onClick={() => setStackOpen(false)}>Հավաքել</button> : null}
              </span>
              {/* Several reminders stack like notifications; a tap spreads them out. */}
              <div className={`relative grid gap-1.5 ${missed.length > 1 && !stackOpen ? "pb-3" : ""}`}>
                {(stackOpen ? missed : missed.slice(0, 1)).map((item) => (
                  <MissedCard key={item.materialId} item={item} opening={opening === item.materialId} onOpen={() => setOpening(item.materialId)} />
                ))}
                {missed.length > 1 && !stackOpen ? (
                  <button className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0" type="button" onClick={() => setStackOpen(true)} aria-label={`Ցույց տալ բոլոր ${missed.length} հիշեցումները`}>
                    <span className="pointer-events-none absolute inset-x-3 bottom-1.5 -z-10 h-4 rounded-b-[14px] border border-t-0 border-glass-border bg-subtle" />
                    {missed.length > 2 ? <span className="pointer-events-none absolute inset-x-6 bottom-0 -z-20 h-4 rounded-b-[14px] border border-t-0 border-glass-border bg-subtle opacity-70" /> : null}
                    <span className="pointer-events-none absolute -top-0.5 right-1 rounded-full bg-[rgb(205_70_55)] px-1.5 text-[10px] font-bold leading-[16px] text-white">+{missed.length - 1}</span>
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          {reminders.length ? <span className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.4px] text-gold uppercase">Իմ հիշեցումները</span> : null}
          {reminders.slice(0, 8).map((reminder) => (
            <Link key={reminder.materialId} className={`grid grid-cols-[30px_1fr] items-center gap-2.5 rounded-[12px] px-2 py-2 text-inherit no-underline hover:bg-subtle active:scale-[.98] ${opening === reminder.materialId ? "bg-[rgb(217_181_111/14%)]" : ""}`} to={materialPath(reminder.materialId, reminder.categoryName, { title: reminder.title })} onClick={() => setOpening(reminder.materialId)} aria-busy={opening === reminder.materialId}>
              <ItemIcon categoryName={reminder.categoryName} busy={opening === reminder.materialId} />
              <span className="grid min-w-0">
                <strong className="truncate text-[13px] text-ink">{reminder.title}</strong>
                <span className="text-[11.5px] text-muted">{opening === reminder.materialId ? "Բացվում է…" : formatWhen(reminder.at)}{REPEAT_TEXT[reminder.repeat] ? ` · ${REPEAT_TEXT[reminder.repeat]}` : ""}</span>
              </span>
            </Link>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
