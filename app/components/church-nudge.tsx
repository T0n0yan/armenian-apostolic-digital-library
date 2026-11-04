import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouteLoaderData } from "react-router";

import { findMyPosition, hasLocationAccess } from "../utils/my-location";
import { formatDistance, nearbyPlaces } from "../utils/places";

const ENABLED_KEY = "church-nudge";
const SHOWN_KEY = "church-nudge-day";
/** Որքան մոտ պետք է լինի եկեղեցին (կմ)։ */
const RADIUS_KM = 1;
const SHOW_MS = 5000;

/** Միացվա՞ծ է այս սարքում «Հուշել, երբ մոտ եմ եկեղեցուն» (`/notes`-ի «Հարցեր» ներդիրից)։ */
export function churchNudgeEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) === "on"; } catch { return false; }
}
export function setChurchNudgeEnabled(on: boolean) {
  try { if (on) localStorage.setItem(ENABLED_KEY, "on"); else localStorage.removeItem(ENABLED_KEY); } catch { /* պահեստը փակ է */ }
}

function yerevanDay() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yerevan" });
}

type Nudge = { questions: number; church: string; km: number };

/**
 * Կայք մտնելիս (օրը մեկ անգամ). եթե մարդն ունի չպատասխանված հարց, միացրել է այս հուշումը և արդեն
 * թույլ է տվել դիրքը, 5 վայրկյանով ցույց է տալիս «❓ Դուք ունեք հարց · ⛪ մոտակայքում է … եկեղեցին»։
 * Դիրքը սարքից դուրս չի գալիս. եկեղեցիների ցանկը բեռնվում է, և հեռավորությունը հաշվում է բրաուզերը։
 */
export function ChurchNudge() {
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  const signedIn = Boolean(rootData?.signedIn);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (!signedIn || !churchNudgeEnabled()) return;
    try { if (localStorage.getItem(SHOWN_KEY) === yerevanDay()) return; } catch { return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const count = await fetch("/api/highlights?questions=1").then((response) => response.json() as Promise<{ openQuestions?: number }>).catch(() => null);
      const questions = count?.openQuestions ?? 0;
      if (cancelled || questions < 1 || !(await hasLocationAccess())) return;
      const position = await findMyPosition().catch(() => null);
      if (cancelled || !position) return;
      const points = await fetch("/api/church-points").then((response) => response.json() as Promise<{ places?: Array<{ name: string; latitude: number; longitude: number }> }>).catch(() => null);
      const nearest = nearbyPlaces(points?.places ?? [], position, RADIUS_KM)[0];
      if (cancelled || !nearest) return;
      try { localStorage.setItem(SHOWN_KEY, yerevanDay()); } catch { /* պահեստը փակ է */ }
      setPhase("in");
      setNudge({ questions, church: nearest.place.name, km: nearest.km });
    }, 2500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [signedIn]);

  useEffect(() => {
    if (!nudge) return;
    const hide = window.setTimeout(() => setPhase("out"), SHOW_MS);
    const remove = window.setTimeout(() => setNudge(null), SHOW_MS + 450);
    return () => { window.clearTimeout(hide); window.clearTimeout(remove); };
  }, [nudge]);

  if (!nudge || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--tg-inset-top,0px)+12px)] z-[2060] flex justify-center px-3" role="status">
      <Link to="/notes?tab=questions" onClick={() => setPhase("out")} data-phase={phase}
        className="install-toast pointer-events-auto grid w-full max-w-[420px] gap-0.5 rounded-[18px] border border-[rgb(120_165_230/45%)] bg-[var(--page-bg)] px-4 py-3 text-ink no-underline shadow-[0_18px_44px_rgb(40_20_10/26%)]">
        <strong className="text-[14px]">❓ Դուք ունեք {nudge.questions === 1 ? "հարց" : `${nudge.questions} հարց`}</strong>
        <span className="text-[13px] leading-snug text-muted">⛪ Մոտակայքում՝ {nudge.church} ({formatDistance(nudge.km)})։ Կարող եք հարցնել հոգևորականին։</span>
      </Link>
    </div>,
    document.body,
  );
}
