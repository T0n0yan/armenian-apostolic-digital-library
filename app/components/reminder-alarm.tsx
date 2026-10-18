import { BookOpen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { CategoryIcon } from "./category-icon";
import { REMINDERS_CHANGED_EVENT } from "./reminder-button";

type Upcoming = { materialId: string; at: string; title: string; categoryName: string | null };

const COUNTDOWN_SECONDS = 5;
const REFRESH_MS = 10 * 60_000;
const BELL_URL = "/sounds/church-bell.mp3";

async function post(body: Record<string, unknown>) {
  await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
}

/**
 * The in-app alarm: while the library is open, a due reminder slides up with a five-second
 * countdown, then the church bell rings once. The reader can open the material or snooze it for
 * one or five minutes. (With the library closed, Telegram's bot message reminds instead.)
 */
export function ReminderAlarm() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Upcoming[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timers = useRef(new Map<string, number>());
  const bell = useRef<HTMLAudioElement | null>(null);
  const current = queue[0] ?? null;

  const ring = useCallback((reminder: Upcoming) => {
    // Mark it rung right away so the bot doesn't also send it.
    void post({ materialId: reminder.materialId, rang: true });
    setQueue((items) => items.some((item) => item.materialId === reminder.materialId) ? items : [...items, reminder]);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/reminders?upcoming=1").catch(() => null);
    const data = response?.ok ? await response.json().catch(() => null) as { reminders?: Upcoming[] } | null : null;
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    for (const reminder of data?.reminders ?? []) {
      const startAt = Date.parse(reminder.at) - COUNTDOWN_SECONDS * 1000;
      timers.current.set(reminder.materialId, window.setTimeout(() => ring(reminder), Math.max(0, startAt - Date.now())));
    }
  }, [ring]);

  useEffect(() => {
    bell.current = new Audio(BELL_URL);
    bell.current.preload = "auto";
    void load();
    const refresh = window.setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener(REMINDERS_CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    const pending = timers.current;
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, [load]);

  // Count down, then ring the bell once.
  useEffect(() => {
    if (!current) return;
    setPhase("in");
    const ringsAt = Math.max(Date.now(), Date.parse(current.at));
    const tick = () => {
      const left = Math.max(0, Math.ceil((ringsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(interval);
        const audio = bell.current;
        if (audio) { audio.currentTime = 0; void audio.play().catch(() => undefined); }
        navigator.vibrate?.([120, 80, 120]);
      }
    };
    const interval = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(interval);
  }, [current]);

  const dismiss = useCallback(() => {
    setPhase("out");
    window.setTimeout(() => setQueue((items) => items.slice(1)), 380);
  }, []);

  const snooze = async (minutes: 1 | 5) => {
    if (!current) return;
    const reminder = current;
    dismiss();
    await post({ materialId: reminder.materialId, snooze: minutes });
    const at = new Date(Date.now() + minutes * 60_000).toISOString();
    timers.current.set(reminder.materialId, window.setTimeout(() => ring({ ...reminder, at }), minutes * 60_000 - COUNTDOWN_SECONDS * 1000));
  };

  if (!current) return null;
  const counting = secondsLeft > 0;
  const action = "min-h-10 cursor-pointer rounded-[12px] border px-3 text-[12.5px] font-bold";
  return (
    <aside
      className="install-toast fixed right-[calc(var(--tg-inset-right,0px)+12px)] bottom-[calc(var(--tg-inset-bottom,0px)+14px)] left-[calc(var(--tg-inset-left,0px)+12px)] z-[70] mx-auto grid max-w-[440px] gap-3 rounded-[22px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-4 shadow-[0_22px_60px_rgb(40_20_10/35%)]"
      data-phase={phase}
      role="alertdialog"
      aria-live="assertive"
      aria-label="Հիշեցում"
    >
      <div className="grid grid-cols-[48px_1fr_auto] items-center gap-3">
        <span className={`relative grid size-12 place-items-center rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/12%)] text-gold-bright ${counting ? "" : "reminder-ring"}`} aria-hidden="true">
          <CategoryIcon categoryId="" categoryName={current.categoryName} size={24} />
          {counting ? <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[12px] font-bold text-[#2a1708] tabular-nums">{secondsLeft}</span> : null}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="text-[11px] font-bold tracking-[0.4px] text-gold uppercase">{counting ? `Զանգը՝ ${secondsLeft} վայրկյանից` : "Ժամանակն է կարդալու"}</span>
          <strong className="line-clamp-2 text-[14.5px] leading-snug text-ink">{current.title}</strong>
        </div>
        <button className="grid size-9 cursor-pointer place-items-center self-start rounded-full border-0 bg-transparent text-muted" type="button" onClick={dismiss} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          className={`${action} inline-flex items-center justify-center gap-1.5 border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`}
          type="button"
          onClick={() => { const id = current.materialId; dismiss(); navigate(`/materials/${id}`); }}
        >
          <BookOpen aria-hidden="true" size={16} /> Կարդալ
        </button>
        <button className={`${action} border-glass-border bg-subtle text-ink`} type="button" onClick={() => snooze(1)}>1 րոպեից</button>
        <button className={`${action} border-glass-border bg-subtle text-ink`} type="button" onClick={() => snooze(5)}>5 րոպեից</button>
      </div>
    </aside>
  );
}
