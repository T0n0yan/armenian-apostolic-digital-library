import { Bell, BellRing, CalendarPlus, Check, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "./bottom-sheet";
import { REMINDERS_CHANGED_EVENT } from "../utils/reminder-store";
import { enablePushNotifications, pushSupport, type PushSupport } from "../utils/web-push";
import { calendarFileUrl, googleCalendarUrl } from "../utils/calendar";

type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
type Mode = "daily" | "date";
/** "calendar": an event in the phone's calendar (the phone rings it); "push": the site sends it. */
type Channel = "calendar" | "push";
type Reminder = { remindAt: string; repeat: Repeat; channel?: Channel };

type TelegramWriteAccess = Window & {
  Telegram?: { WebApp?: {
    initData?: string; platform?: string;
    isVersionAtLeast?: (version: string) => boolean;
    requestWriteAccess?: (callback: (granted: boolean) => void) => void;
    openLink?: (url: string, options?: { try_browser?: string; try_instant_view?: boolean }) => void;
  } };
};

/** Opens a calendar link outside the Mini App (Telegram's own view can't add calendar events). */
function openCalendarLink(event: { preventDefault: () => void }, url: string) {
  const webApp = (window as TelegramWriteAccess).Telegram?.WebApp;
  if (!webApp?.initData || !webApp.openLink) return;
  event.preventDefault();
  webApp.openLink(url, { try_browser: webApp.platform === "ios" ? "safari" : "chrome", try_instant_view: false });
}

const REPEATS: Array<{ value: Repeat; label: string }> = [
  { value: "none", label: "Մեկ անգամ" },
  { value: "weekly", label: "Ամեն շաբաթ" },
  { value: "monthly", label: "Ամեն ամիս" },
  { value: "yearly", label: "Ամեն տարի" },
];
const REPEAT_TEXT: Record<Repeat, string> = { none: "", daily: ", ամեն օր", weekly: ", ամեն շաբաթ", monthly: ", ամեն ամիս", yearly: ", ամեն տարի" };
const WEEKDAYS = ["Կիր", "Երկ", "Երք", "Չոր", "Հնգ", "Ուրբ", "Շբթ"];
const MONTHS = ["հունվ", "փետր", "մարտ", "ապր", "մայիս", "հունիս", "հուլիս", "օգոստ", "սեպտ", "հոկտ", "նոյ", "դեկտ"];
const ITEM = 40;
const DAY_STRIP = 45;

const pad = (value: number) => String(value).padStart(2, "0");
/** A local calendar day as YYYY-MM-DD. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function combine(day: string, hour: number, minute: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, hour, minute, 0, 0);
}
/** The next time the clock shows hour:minute: today if still ahead, otherwise tomorrow. */
function nextDaily(hour: number, minute: number) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() < Date.now() + 30_000) date.setDate(date.getDate() + 1);
  return date;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("hy-AM", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Asks Telegram to let the library's bot message the reader; true where that isn't needed. */
function requestWriteAccess() {
  const webApp = (window as TelegramWriteAccess).Telegram?.WebApp;
  if (!webApp?.initData || !webApp.requestWriteAccess || (webApp.isVersionAtLeast && !webApp.isVersionAtLeast("6.9"))) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => webApp.requestWriteAccess?.(resolve));
}

/** A scrolling wheel of numbers (hours or minutes) that snaps to the middle row. */
function Wheel({ count, value, onChange, label }: { count: number; value: number; onChange: (value: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (element && Math.round(element.scrollTop / ITEM) !== value) element.scrollTo({ top: value * ITEM });
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-x-1 top-[40px] h-[40px] rounded-[12px] border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/12%)]" aria-hidden="true" />
      <div
        ref={ref}
        className="time-wheel relative h-[120px] w-[64px] overflow-y-auto py-[40px] text-center"
        role="listbox"
        aria-label={label}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          window.clearTimeout(settle.current);
          settle.current = window.setTimeout(() => onChange(Math.max(0, Math.min(count - 1, Math.round(top / ITEM)))), 90);
        }}
      >
        {Array.from({ length: count }, (_, index) => (
          <button key={index} className={`block h-[40px] w-full cursor-pointer border-0 bg-transparent font-sans text-[20px] tabular-nums transition-colors ${index === value ? "font-bold text-ink" : "text-faint"}`} type="button" role="option" aria-selected={index === value} onClick={() => onChange(index)}>
            {pad(index)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Remind me to read this": every day at a time, or on a chosen day (once or repeating). When it
 * is due the bell rings in the library; with the library closed, a notification or the Telegram
 * bot reminds instead.
 */
export function ReminderButton({ materialId, title, className, label = false, prefetch = false, path }: { materialId: string; title: string; className: string; label?: boolean; prefetch?: boolean; path?: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("calendar");
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(/Android/u.test(navigator.userAgent)), []);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("date");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushSupport>("unsupported");
  const [granted, setGranted] = useState(false);
  const otherDayRef = useRef<HTMLInputElement>(null);

  const refreshPush = useCallback(() => {
    setPush(pushSupport());
    setGranted(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);
  useEffect(refreshPush, [refreshPush]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/reminders?materialId=${encodeURIComponent(materialId)}`).catch(() => null);
    const data = response?.ok ? await response.json() as { reminder: Reminder | null } : { reminder: null };
    setReminder(data.reminder);
    setLoaded(true);
    return data.reminder;
  }, [materialId]);

  // On a material's own page, show a ringing bell when it already has a reminder (lists load it
  // only when the sheet opens, to avoid a request per card).
  useEffect(() => { if (prefetch) void load(); }, [load, prefetch]);

  const openSheet = async () => {
    setError(null);
    refreshPush();
    setOpen(true);
    const current = loaded ? reminder : await load();
    const at = current ? new Date(current.remindAt) : new Date(Date.now() + 3_600_000);
    setDay(dayKey(at));
    setHour(at.getHours());
    setMinute(current ? at.getMinutes() : 0);
    setMode(current?.repeat === "daily" ? "daily" : "date");
    setRepeat(current && current.repeat !== "daily" ? current.repeat : "none");
    // The phone's calendar first: it rings offline and costs the server nothing.
    setChannel(current?.channel ?? "calendar");
  };

  const days = useMemo(() => Array.from({ length: DAY_STRIP }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return { key: dayKey(date), top: index === 0 ? "Այսօր" : index === 1 ? "Վաղը" : WEEKDAYS[date.getDay()], bottom: `${date.getDate()} ${MONTHS[date.getMonth()]}` };
  }), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherDay = !days.some((item) => item.key === day);

  const chosen = mode === "daily" ? nextDaily(hour, minute) : combine(day, hour, minute);
  const tooSoon = chosen.getTime() < Date.now() + 30_000;

  const turnOnNotifications = async () => {
    await enablePushNotifications();
    refreshPush();
  };

  const save = async () => {
    if (tooSoon) { setError("Հիշեցումը պետք է լինի առնվազն 1 րոպե հետո։"); return; }
    if (chosen.getTime() > Date.now() + 365 * 86_400_000) { setError("Հիշեցումը կարելի է դնել առավելագույնը մեկ տարի առաջ։"); return; }
    setBusy(true);
    setError(null);
    const chosenRepeat: Repeat = mode === "daily" ? "daily" : repeat;
    if (push === "ready" && !granted) void turnOnNotifications();
    if (!(await requestWriteAccess())) { setBusy(false); setError("Առանց թույլտվության բոտը չի կարող հիշեցում ուղարկել։"); return; }
    const response = await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId, remindAt: chosen.toISOString(), repeat: chosenRepeat, channel: "push" }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError("Չհաջողվեց պահել։ Փորձեք նորից։"); return; }
    setReminder({ remindAt: chosen.toISOString(), repeat: chosenRepeat, channel: "push" });
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
    setOpen(false);
  };

  // The calendar link opens in its own tab; the reminder is noted at the same tap so the bell
  // shows it (the server never sends a calendar reminder).
  const calendarEvent = { title, path: path ?? `/materials/${encodeURIComponent(materialId)}`, start: chosen, repeat: mode === "daily" ? "daily" as const : repeat };
  const origin = typeof window === "undefined" ? "https://apostolic.am" : window.location.origin;
  const noteCalendarReminder = () => {
    const chosenRepeat: Repeat = mode === "daily" ? "daily" : repeat;
    void fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId, remindAt: chosen.toISOString(), repeat: chosenRepeat, channel: "calendar" }),
      keepalive: true,
    }).catch(() => null);
    setReminder({ remindAt: chosen.toISOString(), repeat: chosenRepeat, channel: "calendar" });
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
    window.setTimeout(() => setOpen(false), 400);
  };

  const remove = async () => {
    setBusy(true);
    await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, remove: true }) }).catch(() => null);
    setBusy(false);
    setReminder(null);
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
    setOpen(false);
  };

  const close = useCallback(() => setOpen(false), []);
  const Icon = reminder ? BellRing : Bell;
  const primary = "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[14px] font-bold text-[#2a1708] no-underline shadow-[0_8px_20px_rgb(150_100_30/25%)] disabled:opacity-60";
  const secondary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-[rgb(217_181_111/40%)] bg-transparent text-[13px] font-semibold text-gold-bright no-underline";
  const segment = (active: boolean) => `min-h-10 cursor-pointer rounded-[10px] border-0 text-[13px] font-semibold ${active ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`;
  return (
    <>
      <button className={className} type="button" onClick={openSheet} aria-label={reminder ? `Հիշեցում՝ ${formatWhen(reminder.remindAt)}` : "Հիշեցնել կարդալու մասին"} title="Հիշեցում">
        <Icon aria-hidden="true" size={label ? 20 : 17} strokeWidth={1.9} fill={reminder ? "currentColor" : "none"} />
        {label ? <span>{reminder ? "Դրված է" : "Հիշեցնել"}</span> : null}
      </button>
      <BottomSheet open={open} onClose={close} label="Հիշեցում" className="gap-3.5 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright"><BellRing aria-hidden="true" size={19} /></span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <strong className="text-[15px] text-ink">Հիշեցնել կարդալու մասին</strong>
            <span className="line-clamp-1 text-[12.5px] text-muted">{title}</span>
          </div>
          <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={close} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
        </div>

        {reminder ? (
          <p className="m-0 rounded-[14px] border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/9%)] px-3.5 py-2.5 text-[13px] text-ink">
            Դրված է՝ <strong>{formatWhen(reminder.remindAt)}</strong>{REPEAT_TEXT[reminder.repeat]}{reminder.channel === "calendar" ? " · 📅 օրացույցում" : ""}
          </p>
        ) : null}

        <div className="grid gap-1.5">
          <span className="px-1 text-[11px] font-bold tracking-[0.4px] text-gold uppercase">Ինչպես հիշեցնել</span>
          <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-subtle p-1" role="radiogroup" aria-label="Ինչպես հիշեցնել">
            <button className={segment(channel === "calendar")} type="button" role="radio" aria-checked={channel === "calendar"} onClick={() => setChannel("calendar")}>📅 Օրացույցով</button>
            <button className={segment(channel === "push")} type="button" role="radio" aria-checked={channel === "push"} onClick={() => setChannel("push")}>🔔 Ծանուցումով</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-subtle p-1" role="radiogroup" aria-label="Երբ">
          <button className={segment(mode === "daily")} type="button" role="radio" aria-checked={mode === "daily"} onClick={() => setMode("daily")}>Ամեն օր</button>
          <button className={segment(mode === "date")} type="button" role="radio" aria-checked={mode === "date"} onClick={() => setMode("date")}>Որոշակի օր</button>
        </div>

        {mode === "date" ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="listbox" aria-label="Օր">
            {days.map((item) => (
              <button key={item.key} className={`grid min-w-[62px] shrink-0 cursor-pointer justify-items-center gap-0.5 rounded-[14px] border px-2 py-2 ${item.key === day ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-ink"}`} type="button" role="option" aria-selected={item.key === day} onClick={() => setDay(item.key)}>
                <span className="text-[11px] font-semibold opacity-80">{item.top}</span>
                <span className="text-[13px] font-bold whitespace-nowrap">{item.bottom}</span>
              </button>
            ))}
            <label className={`relative grid min-w-[74px] shrink-0 cursor-pointer place-items-center rounded-[14px] border px-2 text-[12px] font-semibold ${otherDay ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-dashed border-glass-border text-muted"}`}>
              {otherDay ? `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}` : "Այլ օր…"}
              <input ref={otherDayRef} className="absolute inset-0 cursor-pointer opacity-0" type="date" min={dayKey(new Date())} max={dayKey(new Date(Date.now() + 365 * 86_400_000))} value={day}
                onClick={(event) => { try { event.currentTarget.showPicker(); } catch { /* opens natively */ } }}
                onChange={(event) => { if (event.target.value) setDay(event.target.value); }} />
            </label>
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-2">
          <Wheel count={24} value={hour} onChange={setHour} label="Ժամ" />
          <span className="text-[22px] font-bold text-muted">:</span>
          <Wheel count={60} value={minute} onChange={setMinute} label="Րոպե" />
        </div>

        {mode === "date" ? (
          <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-subtle p-1 min-[400px]:grid-cols-4" role="radiogroup" aria-label="Կրկնել">
            {REPEATS.map((option) => (
              <button key={option.value} className={`${segment(repeat === option.value)} min-h-9 text-[12px]`} type="button" role="radio" aria-checked={repeat === option.value} onClick={() => setRepeat(option.value)}>{option.label}</button>
            ))}
          </div>
        ) : null}

        <p className={`m-0 rounded-[12px] px-3 py-2 text-center text-[13px] ${tooSoon ? "bg-[rgb(205_70_55/10%)] text-[#b4472f]" : "bg-subtle text-ink"}`}>
          {tooSoon
            ? "Հիշեցումը պետք է լինի առնվազն 1 րոպե հետո"
            : channel === "calendar"
              ? mode === "daily"
                ? <>Ամեն օր <strong>{pad(hour)}:{pad(minute)}</strong>-ին Ձեր հեռախոսը կհիշեցնի</>
                : <>Ձեր հեռախոսը կհիշեցնի <strong>{formatWhen(chosen.toISOString())}</strong>{REPEAT_TEXT[repeat]}</>
            : mode === "daily"
              ? <>Ամեն օր <strong>{pad(hour)}:{pad(minute)}</strong>-ին Ձեզ կուղարկենք հիշեցում</>
              : <>Ձեզ կհիշեցնենք <strong>{formatWhen(chosen.toISOString())}</strong>{REPEAT_TEXT[repeat]}</>}
        </p>

        {/* Whether reminders can reach the reader while the library is closed. */}
        {channel === "calendar" ? (
          <p className="m-0 text-center text-[12px] leading-snug text-muted">Հիշեցումը կավելանա Ձեր հեռախոսի օրացույցին և կհնչի նույնիսկ առանց ինտերնետի։ Մենք Ձեր օրացույցը չենք տեսնում։</p>
        ) : push === "telegram" ? (
          <p className="m-0 text-center text-[12px] text-muted">Հիշեցումը կստանաք նաև Telegram-ում՝ բոտի հաղորդագրությամբ։</p>
        ) : push === "ready" ? (
          granted ? (
            <p className="m-0 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[rgb(52_130_74)]"><Check aria-hidden="true" size={15} /> Ծանուցումները միացված են</p>
          ) : (
            <button className="min-h-10 cursor-pointer rounded-[12px] border border-[rgb(217_181_111/40%)] bg-transparent text-[12.5px] font-semibold text-gold-bright" type="button" onClick={turnOnNotifications}>
              Միացնել ծանուցումները, որ հիշեցումը գա նաև կայքը փակ ժամանակ
            </button>
          )
        ) : push === "install-first" ? (
          <p className="m-0 text-center text-[12px] leading-snug text-muted">Ծանուցումներ ստանալու համար ավելացրեք գրադարանը գլխավոր էկրանին (Share → «Add to Home Screen») և բացեք այնտեղից։</p>
        ) : push === "denied" ? (
          <p className="m-0 text-center text-[12px] leading-snug text-muted">Ծանուցումներն այս բրաուզերում արգելված են. դրանք կարող եք միացնել բրաուզերի կարգավորումներում։</p>
        ) : null}

        {error ? <p className="m-0 text-center text-[12.5px] text-[#b4472f]" role="alert">{error}</p> : null}
        <div className="grid gap-2">
          {channel === "calendar" ? (
            <>
              {/* Android phones often can't open .ics files by themselves: Google Calendar first. */}
              {android ? (
                <a className={`${primary} ${tooSoon ? "pointer-events-none opacity-60" : ""}`} href={googleCalendarUrl(origin, calendarEvent)} target="_blank" rel="noreferrer"
                  onClick={(event) => { openCalendarLink(event, googleCalendarUrl(origin, calendarEvent)); noteCalendarReminder(); }}>
                  <CalendarPlus aria-hidden="true" size={17} /> Ավելացնել Google Օրացույցին
                </a>
              ) : null}
              <a className={`${android ? secondary : primary} ${tooSoon ? "pointer-events-none opacity-60" : ""}`} href={calendarFileUrl(origin, calendarEvent)} target="_blank" rel="noreferrer"
                onClick={(event) => { openCalendarLink(event, calendarFileUrl(origin, calendarEvent)); noteCalendarReminder(); }}>
                <CalendarPlus aria-hidden="true" size={17} /> {android ? "Այլ օրացույց (.ics)" : "Ավելացնել օրացույցին"}
              </a>
            </>
          ) : (
            <button className={primary} type="button" disabled={busy || tooSoon} onClick={save}>
              {busy ? <LoaderCircle aria-hidden="true" size={17} className="animate-search-spin" /> : <Bell aria-hidden="true" size={17} />}
              {reminder ? "Փոխել հիշեցումը" : "Դնել հիշեցում"}
            </button>
          )}
          {reminder ? <button className="min-h-11 cursor-pointer rounded-[14px] border border-glass-border bg-transparent text-[13px] font-semibold text-muted" type="button" disabled={busy} onClick={remove}>Չեղարկել հիշեցումը</button> : null}
        </div>
      </BottomSheet>
    </>
  );
}
