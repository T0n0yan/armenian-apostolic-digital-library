import { Bell, BellRing, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Repeat = "none" | "daily" | "weekly";
type Reminder = { remindAt: string; repeat: Repeat };

type TelegramWriteAccess = Window & {
  Telegram?: { WebApp?: { initData?: string; isVersionAtLeast?: (version: string) => boolean; requestWriteAccess?: (callback: (granted: boolean) => void) => void } };
};

const REPEATS: Array<{ value: Repeat; label: string }> = [
  { value: "none", label: "Մեկ անգամ" },
  { value: "daily", label: "Ամեն օր" },
  { value: "weekly", label: "Ամեն շաբաթ" },
];

/** A Date as the value of a datetime-local input (the reader's own clock). */
function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function atHour(daysAhead: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function presets() {
  const now = Date.now();
  const tonight = atHour(0, 21);
  return [
    { label: "1 ժամից", date: new Date(now + 3_600_000) },
    { label: tonight.getTime() > now + 60_000 ? "Այսօր 21:00" : "Վաղը 21:00", date: tonight.getTime() > now + 60_000 ? tonight : atHour(1, 21) },
    { label: "Վաղը 08:00", date: atHour(1, 8) },
    { label: "1 շաբաթից", date: new Date(now + 7 * 86_400_000) },
  ];
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("hy-AM", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

/**
 * "Remind me to read this": the reader picks a time (a minute to a year ahead, once or every
 * day/week) and the library's Telegram bot messages them then, with the church bell.
 */
export function ReminderButton({ materialId, title, className, label = false, prefetch = false }: { materialId: string; title: string; className: string; label?: boolean; prefetch?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    setOpen(true);
    const current = loaded ? reminder : await load();
    setWhen(localInputValue(current ? new Date(current.remindAt) : presets()[0].date));
    setRepeat(current?.repeat ?? "none");
  };

  const limits = useMemo(() => ({
    min: localInputValue(new Date(Date.now() + 60_000)),
    max: localInputValue(new Date(Date.now() + 365 * 86_400_000)),
  }), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const date = new Date(when);
    if (!when || Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 30_000) { setError("Ընտրիր առնվազն մեկ րոպե հետո ժամ։"); return; }
    setBusy(true);
    setError(null);
    const granted = await requestWriteAccess();
    if (!granted) { setBusy(false); setError("Առանց թույլտվության բոտը չի կարող հիշեցում ուղարկել։"); return; }
    const response = await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId, remindAt: date.toISOString(), repeat }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setError("Չհաջողվեց պահել։ Փորձիր նորից։"); return; }
    setReminder({ remindAt: date.toISOString(), repeat });
    setOpen(false);
  };

  const remove = async () => {
    setBusy(true);
    await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, remove: true }) }).catch(() => null);
    setBusy(false);
    setReminder(null);
    setOpen(false);
  };

  const Icon = reminder ? BellRing : Bell;
  const chip = "min-h-9 cursor-pointer rounded-full border px-3 text-[12.5px] font-semibold";
  return (
    <>
      <button className={className} type="button" onClick={openSheet} aria-label={reminder ? `Հիշեցում՝ ${formatWhen(reminder.remindAt)}` : "Հիշեցնել կարդալու մասին"} title="Հիշեցում">
        <Icon aria-hidden="true" size={17} strokeWidth={1.9} fill={reminder ? "currentColor" : "none"} />
        {label ? (reminder ? "Հիշեցումը դրված է" : "Հիշեցնել") : null}
      </button>
      {mounted && open ? createPortal(
        <div className="fixed inset-0 z-[60] grid items-end justify-items-center p-3 pb-[calc(var(--tg-inset-bottom,0px)+12px)]" role="dialog" aria-label="Հիշեցում">
          <button className="absolute inset-0 cursor-default border-0 bg-[rgb(20_10_24/40%)] p-0" type="button" aria-label="Փակել" onClick={() => setOpen(false)} />
          <div className="install-toast relative grid max-h-[calc(100svh-24px)] w-full max-w-[440px] gap-3.5 overflow-y-auto rounded-[22px] border border-glass-border bg-[var(--page-bg)] p-4 shadow-[0_24px_60px_rgb(20_8_24/40%)]" data-phase="in">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright"><BellRing aria-hidden="true" size={19} /></span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <strong className="text-[15px] text-ink">Հիշեցնել կարդալու մասին</strong>
                <span className="line-clamp-1 text-[12.5px] text-muted">{title}</span>
              </div>
              <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={() => setOpen(false)} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
            </div>

            {reminder ? (
              <p className="m-0 rounded-[14px] border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/9%)] px-3.5 py-2.5 text-[13px] text-ink">
                Կհիշեցնենք՝ <strong>{formatWhen(reminder.remindAt)}</strong>{reminder.repeat === "daily" ? ", ամեն օր" : reminder.repeat === "weekly" ? ", ամեն շաբաթ" : ""}
              </p>
            ) : (
              <p className="m-0 text-[12.5px] leading-[1.55] text-muted">
                Ընտրած ժամին մեր Telegram բոտը քեզ հաղորդագրություն կուղարկի եկեղեցու զանգի ձայնով։ Դրա համար Telegram-ը կխնդրի թույլ տալ բոտին գրել քեզ. ուրիշ ոչինչ չենք ուղարկի։
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {presets().map((preset) => (
                <button key={preset.label} className={`${chip} ${when === localInputValue(preset.date) ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/20%)] text-gold-bright" : "border-glass-border bg-subtle text-ink"}`} type="button" onClick={() => setWhen(localInputValue(preset.date))}>
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="grid gap-1.5 text-[12px] font-semibold text-muted">
              Կամ ընտրիր օրն ու ժամը
              <input className="min-h-11 rounded-[12px] border border-glass-border bg-control px-3 text-[15px] text-ink" type="datetime-local" value={when} min={limits.min} max={limits.max} onChange={(event) => setWhen(event.target.value)} />
            </label>
            <div className="grid grid-cols-3 gap-1.5 rounded-[14px] bg-subtle p-1" role="radiogroup" aria-label="Կրկնել">
              {REPEATS.map((option) => (
                <button key={option.value} className={`min-h-9 cursor-pointer rounded-[10px] border-0 text-[12.5px] font-semibold ${repeat === option.value ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`} type="button" role="radio" aria-checked={repeat === option.value} onClick={() => setRepeat(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            {error ? <p className="m-0 text-[12.5px] text-[#b4472f]" role="alert">{error}</p> : null}
            <div className="grid gap-2">
              <button className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[14px] font-bold text-[#2a1708] shadow-[0_8px_20px_rgb(150_100_30/25%)] disabled:opacity-70" type="button" disabled={busy} onClick={save}>
                {busy ? <LoaderCircle aria-hidden="true" size={17} className="animate-search-spin" /> : <Bell aria-hidden="true" size={17} />}
                {reminder ? "Փոխել հիշեցումը" : "Դնել հիշեցում"}
              </button>
              {reminder ? <button className="min-h-11 cursor-pointer rounded-[14px] border border-glass-border bg-transparent text-[13px] font-semibold text-muted" type="button" disabled={busy} onClick={remove}>Չեղարկել հիշեցումը</button> : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
