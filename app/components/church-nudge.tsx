import { Navigation, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouteLoaderData } from "react-router";

import { findMyPosition, hasLocationAccess } from "../utils/my-location";
import { directionLinks, formatDistance, nearbyPlaces, placeThumbUrl } from "../utils/places";

const ENABLED_KEY = "church-nudge";
/** Երբից կարելի է նորից հուշել (ms). ցույց տալուց հետո՝ 30 րոպե։ */
const NEXT_KEY = "church-nudge-next";
/** «Այսօր այլևս չհուշել»-ի օրը։ */
const OFF_DAY_KEY = "church-nudge-off-day";
const AGAIN_MS = 30 * 60_000;
/** Եկեղեցու մոտ՝ 200 մետր (տիրոջ որոշում, 2026-11-07)։ */
const RADIUS_KM = 0.2;

/** Միացվա՞ծ է այս սարքում «Հուշել, երբ մոտ եմ եկեղեցուն» («Իմ նշումները» → «Հարցեր»)։ */
export function churchNudgeEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) === "on"; } catch { return false; }
}
export function setChurchNudgeEnabled(on: boolean) {
  try { if (on) localStorage.setItem(ENABLED_KEY, "on"); else localStorage.removeItem(ENABLED_KEY); } catch { /* պահեստը փակ է */ }
}

function yerevanDay() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yerevan" });
}

type Church = { id: string; name: string; latitude: number; longitude: number; cover: string | null };
type Nudge = { questions: number; church: Church; km: number };

/** Թեթև թրթռոց (Telegram-ում՝ իր ձևով), որ հուշումը աննկատ չմնա։ Ձայն չկա։ */
function buzz() {
  const haptic = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (type: string) => void } } } }).Telegram?.WebApp?.HapticFeedback;
  if (haptic?.notificationOccurred) haptic.notificationOccurred("success");
  else navigator.vibrate?.(60);
}

/**
 * Կայք մտնելիս և կայք վերադառնալիս (ցույց տալուց հետո՝ 30 րոպե դադար, կամ «Այսօր այլևս չհուշել»). եթե մարդն ունի չպատասխանված հարց, միացրել է այս հուշումը և արդեն
 * թույլ է տվել դիրքը, վերևում բացվում է քարտ «❓ Դուք ունեք հարց · ⛪ Մոտակայքում կա եկեղեցի»։
 * Քարտը մնում է, մինչև մարդը փակի։ «Դեպի եկեղեցի»-ն ցույց է տալիս եկեղեցու նկարը, անունը և
 * ճանապարհը Google Maps-ով կամ Yandex-ով։ Դիրքը սարքից դուրս չի գալիս։
 */
export function ChurchNudge() {
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  const signedIn = Boolean(rootData?.signedIn);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [details, setDetails] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let running = false;
    let shown = false;
    // Ստուգում է կայք մտնելիս և ամեն անգամ, երբ մարդը վերադառնում է կայք (հավելվածը հետին պլանից)։
    // Ցույց տալուց հետո 30 րոպե չի կրկնում. եթե մարդը դեռ եկեղեցու մոտ է և ունի հարց, նորից կհուշի։
    const check = async () => {
      if (running || shown || cancelled || document.visibilityState !== "visible" || !churchNudgeEnabled()) return;
      try {
        if (localStorage.getItem(OFF_DAY_KEY) === yerevanDay()) return;
        if (Date.now() < Number(localStorage.getItem(NEXT_KEY) ?? 0)) return;
      } catch { return; }
      running = true;
      try {
        const count = await fetch("/api/highlights?questions=1").then((response) => response.json() as Promise<{ openQuestions?: number }>).catch(() => null);
        const questions = count?.openQuestions ?? 0;
        if (cancelled || questions < 1 || !(await hasLocationAccess())) return;
        const position = await findMyPosition({ precise: true }).catch(() => null);
        if (cancelled || !position) return;
        const points = await fetch("/api/church-points").then((response) => response.json() as Promise<{ places?: Church[] }>).catch(() => null);
        const nearest = nearbyPlaces(points?.places ?? [], position, RADIUS_KM)[0];
        if (cancelled || !nearest) return;
        try { localStorage.setItem(NEXT_KEY, String(Date.now() + AGAIN_MS)); } catch { /* պահեստը փակ է */ }
        shown = true;
        setPhase("in"); setDetails(false);
        setNudge({ questions, church: nearest.place, km: nearest.km });
        buzz();
      } finally { running = false; }
    };
    const timer = window.setTimeout(() => void check(), 2500);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    // Փակելուց հետո քարտը կարող է նորից գալ (30 րոպեից)
    const onClosed = () => { shown = false; };
    window.addEventListener("church-nudge-closed", onClosed);
    return () => {
      cancelled = true; window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("church-nudge-closed", onClosed);
    };
  }, [signedIn]);

  const close = () => {
    setPhase("out");
    window.setTimeout(() => { setNudge(null); window.dispatchEvent(new Event("church-nudge-closed")); }, 420);
  };
  /** Այսօր այլևս չհուշել (վաղը՝ նորից)։ */
  const offToday = () => { try { localStorage.setItem(OFF_DAY_KEY, yerevanDay()); } catch { /* պահեստը փակ է */ } close(); };

  if (!nudge || typeof document === "undefined") return null;
  const { church } = nudge;
  const picture = church.cover ? placeThumbUrl(church.cover, 320) : null;
  const button = "inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-glass-border bg-subtle px-3 text-[13px] font-bold text-ink no-underline";
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--tg-inset-top,0px)+12px)] z-[2060] flex justify-center px-3" role="dialog" aria-label="Մոտակայքում կա եկեղեցի">
      <div data-phase={phase} className="install-toast pointer-events-auto grid w-full max-w-[420px] gap-2.5 rounded-card border border-[rgb(120_165_230/45%)] liquid-sheet p-3.5 text-ink shadow-[0_18px_44px_rgb(40_20_10/26%)]">
        <div className="flex items-start gap-2">
          <div className="grid flex-1 gap-0.5">
            <strong className="text-[15px]">❓ Դուք ունեք {nudge.questions === 1 ? "հարց" : `${nudge.questions} հարց`}</strong>
            <span className="text-[13px] leading-snug text-muted">⛪ Մոտակայքում կա եկեղեցի ({formatDistance(nudge.km)})։ Կարող եք Ձեր հարցը ուղղել հոգևորականին։</span>
          </div>
          <button className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={close} aria-label="Փակել"><X aria-hidden="true" size={18} /></button>
        </div>

        {details ? (
          <div className="grid gap-2 rounded-button border border-glass-border bg-subtle p-2.5 animate-glass-enter">
            <Link className="flex items-center gap-3 text-ink no-underline" to={`/places/${encodeURIComponent(church.id)}`} onClick={close}>
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-control bg-[#efe3c8] text-[24px]">
                {picture ? <img className="size-full object-cover" src={picture} alt="" loading="lazy" /> : "⛪"}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <strong className="line-clamp-2 text-[14px] leading-snug">{church.name}</strong>
                <span className="text-[12px] text-muted">{formatDistance(nudge.km)} · Մանրամասն</span>
              </span>
            </Link>
            <div className="flex gap-2">
              {directionLinks(church.latitude, church.longitude).map((link) => (
                <a key={link.label} className={button} href={link.href} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" size={15} /> {link.label}</a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          {!details ? <button className={`${button} border-[rgb(120_165_230/45%)] bg-[rgb(120_165_230/14%)]`} type="button" onClick={() => setDetails(true)}>⛪ Դեպի եկեղեցի</button> : null}
          <Link className={button} to="/saved?tab=notes&kind=questions" onClick={close}>❓ Իմ հարցերը</Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5 text-[11.5px] text-faint">
          <span>Փակելուց հետո՝ նորից 30 րոպեից, եթե դեռ մոտ եք։</span>
          <button className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] font-semibold text-muted underline underline-offset-2" type="button" onClick={offToday}>Այսօր այլևս չհուշել</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
