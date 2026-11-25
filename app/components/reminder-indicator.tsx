import { BellOff, BellRing, BookOpen, Check, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { BottomSheet } from "./bottom-sheet";
import { CategoryIcon } from "./category-icon";
import { REMINDER_RINGING_EVENT, cancelReminder, dismissReminder, markReminderDone, useActiveReminders, useMissedReminders } from "../utils/reminder-store";
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
    <div className={`relative z-[2] grid grid-cols-[1fr_auto] items-center gap-2 rounded-button border border-glass-border liquid-sheet px-1.5 py-1.5 shadow-[0_6px_18px_rgb(0_0_0/18%)] transition-colors ${opening ? "bg-[rgb(217_181_111/14%)]" : ""}`}>
      <Link className="relative z-[3] grid min-w-0 grid-cols-[30px_1fr] items-center gap-2.5 rounded-control px-1 py-0.5 text-inherit no-underline hover:bg-subtle active:scale-[.98]" to={materialPath(item.materialId, item.categoryName, { title: item.title })} onClick={onOpen} aria-busy={opening}>
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
 * Դրված հիշեցումների ցանկը՝ ամեն մեկի կողքին «Կարդալ հիմա» և «Չեղարկել»։
 * Օգտագործվում է զանգակի պատուհանում և մենյուի «Հիշեցումներ» էջում։
 */
export function ReminderList({ limit, tabIndex, onOpen }: { limit?: number; tabIndex?: number; onOpen?: () => void }) {
  const reminders = useActiveReminders();
  const [opening, setOpening] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const location = useLocation();
  useEffect(() => { setOpening(null); }, [location.pathname]);
  if (reminders.length === 0) return <p className="m-0 px-2 py-3 text-center text-[12.5px] text-muted">Հիշեցումներ չկան։ Նյութի էջում սեղմեք զանգակը, որ դնեք։</p>;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {(limit ? reminders.slice(0, limit) : reminders).map((reminder) => {
        const busy = opening === reminder.materialId;
        return (
          <li key={reminder.materialId} className={`grid gap-2 rounded-button border border-glass-border px-2 py-2 ${busy ? "bg-[rgb(217_181_111/14%)]" : "bg-subtle"}`}>
            <span className="grid min-w-0 grid-cols-[30px_1fr] items-center gap-2.5">
              <ItemIcon categoryName={reminder.categoryName} busy={busy} />
              <span className="grid min-w-0">
                <strong className="truncate text-[13px] text-ink">{reminder.title}</strong>
                <span className="text-[11.5px] text-muted">{busy ? "Բացվում է…" : formatWhen(reminder.at)}{REPEAT_TEXT[reminder.repeat] ? ` · ${REPEAT_TEXT[reminder.repeat]}` : ""}</span>
              </span>
            </span>
            <span className="grid grid-cols-2 gap-1.5">
              <Link className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-[12.5px] font-bold text-gold-bright no-underline active:scale-[.97]" to={materialPath(reminder.materialId, reminder.categoryName, { title: reminder.title })} tabIndex={tabIndex} onClick={() => { setOpening(reminder.materialId); onOpen?.(); }} aria-busy={busy}>
                <BookOpen aria-hidden="true" size={15} /> Կարդալ հիմա
              </Link>
              <button className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-[rgb(205_70_55/35%)] bg-[rgb(205_70_55/10%)] text-[12.5px] font-bold text-[rgb(190_70_55)] active:scale-[.97] disabled:opacity-60" type="button" tabIndex={tabIndex} disabled={cancelling === reminder.materialId} onClick={() => { setCancelling(reminder.materialId); void cancelReminder(reminder.materialId).finally(() => setCancelling(null)); }}>
                {cancelling === reminder.materialId ? <LoaderCircle className="animate-search-spin" aria-hidden="true" size={15} /> : <BellOff aria-hidden="true" size={15} />} Չեղարկել
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Հիշեցումների պատուհանը՝ ներքևից բարձրացող (BottomSheet). վերևում զանգածները
 * («Կարդացել եմ», կրկին, ջնջել), ներքևում դրվածները («Կարդալ հիմա», «Չեղարկել»)։
 * Բացվում է մենյուի «Հիշեցումներ» սալիկից և զանգած զանգակից։
 */
export function ReminderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reminders = useActiveReminders();
  const missed = useMissedReminders();
  const [opening, setOpening] = useState<string | null>(null);
  const [stackOpen, setStackOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpening(null); onClose(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = reminders.length + missed.length;
  return (
    <BottomSheet open={open} onClose={onClose} label="Հիշեցումներ" className="gap-3 p-4 pt-2" swipeToClose>
      <div className="flex items-center justify-between gap-3" data-sheet-drag>
        <span className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full border border-[rgb(217_181_111/38%)] bg-[rgb(217_181_111/10%)] text-gold-bright"><BellRing aria-hidden="true" size={18} strokeWidth={1.9} /></span>
          <span className="grid">
            <strong className="font-noto text-[16px] leading-tight text-ink">Իմ հիշեցումները</strong>
            <span className="text-[11.5px] text-muted">{count ? `${count} հիշեցում` : "Դեռ չկան"}</span>
          </span>
        </span>
        <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted hover:text-ink" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={18} /></button>
      </div>
      {missed.length ? (
        <section className="grid gap-1.5">
          <span className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold tracking-[0.4px] text-[rgb(205_70_55)] uppercase">Ժամանակն է կարդալու</span>
            {missed.length > 1 && stackOpen ? <button className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-muted" type="button" onClick={() => setStackOpen(false)}>Հավաքել</button> : null}
          </span>
          {/* Մի քանի զանգածը դարսվում են ծանուցումների պես. սեղմելով բացվում են։ */}
          <div className={`relative grid gap-1.5 ${missed.length > 1 && !stackOpen ? "pb-3" : ""}`}>
            {(stackOpen ? missed : missed.slice(0, 1)).map((item) => (
              <MissedCard key={item.materialId} item={item} opening={opening === item.materialId} onOpen={() => setOpening(item.materialId)} />
            ))}
            {missed.length > 1 && !stackOpen ? (
              <button className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0" type="button" onClick={() => setStackOpen(true)} aria-label={`Ցույց տալ բոլոր ${missed.length} հիշեցումները`}>
                <span className="pointer-events-none absolute inset-x-3 bottom-1.5 -z-10 h-4 rounded-b-button border border-t-0 border-glass-border bg-subtle" />
                {missed.length > 2 ? <span className="pointer-events-none absolute inset-x-6 bottom-0 -z-20 h-4 rounded-b-button border border-t-0 border-glass-border bg-subtle opacity-70" /> : null}
                <span className="pointer-events-none absolute -top-0.5 right-1 rounded-full bg-[rgb(205_70_55)] px-1.5 text-[10px] font-bold leading-[16px] text-white">+{missed.length - 1}</span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {reminders.length || !missed.length ? (
        <section className="grid gap-1.5">
          {missed.length ? <span className="px-1 text-[11px] font-bold tracking-[0.4px] text-gold uppercase">Դրված</span> : null}
          <ReminderList />
        </section>
      ) : null}
    </BottomSheet>
  );
}

/**
 * Զանգակը մենյուի կոճակի վրա՝ միայն երբ հիշեցումը զանգել է և դեռ չի կարդացվել.
 * դրված (դեռ չզանգած) հիշեցումները մենյուի «Հիշեցումներ» սալիկում են։
 * Զանգելիս զանգակը օրորվում է. սեղմելիս բացվում է հիշեցումների պատուհանը։
 */
export function ReminderIndicator({ hidden = false, onOpen }: { hidden?: boolean; onOpen: () => void }) {
  const missed = useMissedReminders();
  const [swinging, setSwinging] = useState(false);

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

  const count = missed.length;
  if (!count) return null;
  return (
        <div className={`pointer-events-auto mr-2 mb-2.5 transition-opacity duration-200 ${hidden ? "hidden" : "opacity-100"}`}>
          <button
            className={`relative grid size-[46px] cursor-pointer place-items-center rounded-full border border-[var(--fab-border)] bg-[var(--fab-bg)] text-gold-bright shadow-[var(--fab-shadow)] backdrop-blur-xl ${swinging ? "bell-swing" : ""}`}
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            aria-label={`Հիշեցումներ՝ ${count}`}
            title="Հիշեցումներ"
          >
            <BellRing aria-hidden="true" size={20} strokeWidth={1.9} />
            <span className="absolute -top-1 -right-1 grid min-w-[17px] place-items-center rounded-full bg-[rgb(205_70_55)] px-1 text-[10px] font-bold leading-[17px] text-white">{count}</span>
          </button>
        </div>
  );
}
