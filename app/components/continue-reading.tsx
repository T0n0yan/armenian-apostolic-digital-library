import { BookOpen, ChevronRight, Headphones, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { forgetPlace, lastPlace, rememberPlace, sectionOfPath, timeAgo, type LastPlace } from "../utils/last-place";

/** Կարդալը հաշվում ենք, եթե մարդը էջում մնացել է առնվազն այսքան (կամ միացրել է ձայնը)։ */
const READ_AFTER_MS = 8000;

/**
 * Հիշում է, թե ինչ է մարդը կարդացել կամ լսել (նյութի էջերում՝ article[data-highlight-material]),
 * և որքան էր թերթել։ «Շարունակել»-ով վերադառնալիս էջը թերթվում է նույն տեղը։
 */
export function PlaceTracker() {
  const location = useLocation();
  useEffect(() => {
    let info: Omit<LastPlace, "at" | "progress" | "kind"> | null = null;
    let kind: LastPlace["kind"] = "read";
    let progress = 0;
    let saved = false;
    const read = () => {
      const root = document.querySelector<HTMLElement>("[data-highlight-material]");
      if (!root) return null;
      const path = root.dataset.highlightPath || location.pathname;
      const section = sectionOfPath(path);
      const psalm = /^\/psalms\/(\d{1,3})$/u.exec(path)?.[1];
      return { section, sectionName: root.dataset.sectionName ?? "", path, title: psalm ? `Սաղմոս ${psalm}` : root.dataset.highlightTitle || document.title };
    };
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress = max > 0 ? window.scrollY / max : 0;
    };
    const save = () => { if (!info) return; rememberPlace({ ...info, kind, progress }); saved = true; };

    const start = window.setTimeout(() => { info = read(); }, 400);
    const timer = window.setTimeout(() => { info ??= read(); save(); }, READ_AFTER_MS);
    // «Շարունակել»-ից. նույն տեղը։
    const resume = (location.state as { resume?: number } | null)?.resume;
    const back = typeof resume === "number" && resume > 0.02 ? window.setTimeout(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: resume * max, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 700) : undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; measure(); if (saved) save(); });
    };
    const onPlay = (event: Event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      info ??= read();
      kind = "listen";
      save();
    };
    const onHide = () => { if (document.visibilityState === "hidden" && saved) save(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("play", onPlay, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(start); window.clearTimeout(timer); window.clearTimeout(back);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("visibilitychange", onHide);
      if (saved) save();
    };
  }, [location.pathname, location.state]);
  return null;
}

/**
 * «Վերջինը կարդացել եք՝ Սաղմոս 25 · Շարունակել»։ Բաժնի էջում՝ այդ բաժնինը, գլխավոր էջում՝ ամենավերջինը։
 * Միայն այս սարքում (մուտք պետք չէ)։ ✕-ով մոռանում է։
 */
export function ContinueCard({ section, className = "" }: { section?: string; className?: string }) {
  const [place, setPlace] = useState<LastPlace | null>(null);
  useEffect(() => setPlace(lastPlace(section)), [section]);
  if (!place) return null;
  const listen = place.kind === "listen";
  const Icon = listen ? Headphones : BookOpen;
  return (
    <div className={`continue-card relative ${className}`}>
      <Link className="frosted-panel flex items-center gap-3 py-2.5 pr-9 pl-3 text-ink no-underline" to={place.path} state={{ resume: place.progress }} aria-label={`Շարունակել՝ ${place.title}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright"><Icon aria-hidden="true" size={18} /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="line-clamp-1 text-[11.5px] text-muted">{listen ? "Վերջինը լսել եք" : "Վերջինը կարդացել եք"} · {timeAgo(place.at)}</span>
          <strong className="line-clamp-1 text-[15px]">{place.title}</strong>
          <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[rgb(217_181_111/18%)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#e2c27e,#b07d2e)]" style={{ width: `${Math.max(6, Math.round(place.progress * 100))}%` }} />
          </span>
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]" aria-hidden="true"><ChevronRight size={18} strokeWidth={2.2} /></span>
      </Link>
      <button className="absolute top-1 right-1 grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint" type="button"
        onClick={() => { forgetPlace(place.section); setPlace(null); }} aria-label="Մոռանալ"><X aria-hidden="true" size={13} /></button>
    </div>
  );
}
