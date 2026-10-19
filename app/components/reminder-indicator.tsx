import { BellRing, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import { CategoryIcon } from "./category-icon";
import { REMINDER_RINGING_EVENT, markReminderRead, useActiveReminders, useMissedReminders } from "../utils/reminder-store";

const REPEAT_TEXT: Record<string, string> = { daily: "ամեն օր", weekly: "ամեն շաբաթ", monthly: "ամեն ամիս", yearly: "ամեն տարի" };

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const time = date.toLocaleTimeString("hy-AM", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `այսօր ${time}`;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (date.toDateString() === tomorrow.toDateString()) return `վաղը ${time}`;
  return `${date.toLocaleDateString("hy-AM", { day: "numeric", month: "long" })}, ${time}`;
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
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (reminders.length === 0 && missed.length === 0) return null;
  const count = missed.length || reminders.length;
  return (
    <div className={`pointer-events-auto mr-2 mb-2.5 transition-opacity duration-200 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`} ref={rootRef}>
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
        <div ref={listRef} style={{ bottom: anchor.bottom, right: anchor.right }} className="fixed z-[75] grid w-[min(340px,calc(100vw-32px))] gap-1 rounded-[18px] border border-glass-border bg-[var(--page-bg)] p-2 text-left shadow-[0_18px_44px_rgb(40_20_10/25%)]" role="dialog" aria-label="Հիշեցումներ">
          {missed.length ? (
            <>
              <span className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.4px] text-[rgb(205_70_55)] uppercase">Ժամանակն է կարդալու</span>
              {missed.map((item) => (
                <div key={item.materialId} className="grid grid-cols-[30px_1fr_auto] items-center gap-2.5 rounded-[12px] px-2 py-1.5">
                  <span className="grid size-[30px] place-items-center rounded-full bg-[rgb(217_181_111/12%)] text-gold-bright"><CategoryIcon categoryId="" categoryName={item.categoryName} size={16} /></span>
                  <Link className="grid min-w-0 text-inherit no-underline" to={`/materials/${item.materialId}`} onClick={() => setOpen(false)}>
                    <strong className="truncate text-[13px] text-ink">{item.title}</strong>
                    <span className="text-[11.5px] text-muted">{formatWhen(item.rangAt)}</span>
                  </Link>
                  <button className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-[rgb(74_160_96/45%)] bg-[rgb(74_160_96/12%)] px-2.5 text-[11.5px] font-bold text-[rgb(52_130_74)]" type="button" onClick={() => void markReminderRead(item.materialId)}>
                    <Check aria-hidden="true" size={13} /> Կարդացել եմ
                  </button>
                </div>
              ))}
            </>
          ) : null}
          {reminders.length ? <span className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.4px] text-gold uppercase">Իմ հիշեցումները</span> : null}
          {reminders.slice(0, 8).map((reminder) => (
            <Link key={reminder.materialId} className="grid grid-cols-[30px_1fr] items-center gap-2.5 rounded-[12px] px-2 py-2 text-inherit no-underline hover:bg-subtle" to={`/materials/${reminder.materialId}`} onClick={() => setOpen(false)}>
              <span className="grid size-[30px] place-items-center rounded-full bg-[rgb(217_181_111/12%)] text-gold-bright"><CategoryIcon categoryId="" categoryName={reminder.categoryName} size={16} /></span>
              <span className="grid min-w-0">
                <strong className="truncate text-[13px] text-ink">{reminder.title}</strong>
                <span className="text-[11.5px] text-muted">{formatWhen(reminder.at)}{REPEAT_TEXT[reminder.repeat] ? ` · ${REPEAT_TEXT[reminder.repeat]}` : ""}</span>
              </span>
            </Link>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
