import { BookOpen, ChevronRight, Headphones, PlayCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router";

import { forgetPlace, formatMediaTime, lastPlace, rememberPlace, sectionOfPath, timeAgo, type LastPlace } from "../utils/last-place";

/** Կարդալը հաշվում ենք, եթե մարդը էջում մնացել է առնվազն այսքան (կամ միացրել է ձայնը/տեսանյութը)։ */
const READ_AFTER_MS = 8000;
type Resume = { resume?: number; mediaTime?: number; play?: boolean };

function useSignedIn() {
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  return Boolean(rootData?.signedIn);
}

/**
 * Հիշում է (միայն մուտք գործածների համար), թե ինչ է մարդը կարդացել, լսել կամ դիտել (նյութի
 * էջերում՝ article[data-highlight-material]), որքան էր թերթել և տեսանյութի որ վայրկյանին էր։
 * «Շարունակել»-ով վերադառնալիս էջը թերթվում է նույն տեղը, տեսանյութը՝ նույն վայրկյանը։
 */
export function PlaceTracker() {
  const location = useLocation();
  const signedIn = useSignedIn();
  useEffect(() => {
    let info: Omit<LastPlace, "at" | "progress" | "kind"> | null = null;
    let kind: LastPlace["kind"] = "read";
    let progress = 0;
    let mediaTime: number | undefined;
    let saved = false;
    const read = () => {
      const root = document.querySelector<HTMLElement>("[data-highlight-material]");
      if (!root) return null;
      const path = root.dataset.highlightPath || location.pathname;
      const psalm = /^\/psalms\/(\d{1,3})$/u.exec(path)?.[1];
      return { section: sectionOfPath(path), sectionName: root.dataset.sectionName ?? "", path, title: psalm ? `Սաղմոս ${psalm}` : root.dataset.highlightTitle || document.title };
    };
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress = max > 0 ? window.scrollY / max : 0;
    };
    const save = () => { if (!info || !signedIn) return; rememberPlace({ ...info, kind, progress, mediaTime }); saved = true; };

    // «Շարունակել»-ից. նույն տեղը, տեսանյութը՝ նույն վայրկյանից։
    const state = (location.state ?? {}) as Resume;
    const back = window.setTimeout(() => {
      if (typeof state.resume === "number" && state.resume > 0.02 && typeof state.mediaTime !== "number") {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: state.resume * max, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      if (typeof state.mediaTime === "number") {
        const video = document.querySelector<HTMLVideoElement>("[data-highlight-material] video");
        if (!video) return;
        const seek = () => {
          video.currentTime = state.mediaTime as number;
          video.scrollIntoView({ block: "center", behavior: "smooth" });
          if (state.play) void video.play().catch(() => undefined);
        };
        if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
      }
    }, 600);

    const start = window.setTimeout(() => { info = read(); }, 400);
    const timer = window.setTimeout(() => { info ??= read(); save(); }, READ_AFTER_MS);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; measure(); if (saved && kind === "read") save(); });
    };
    const onPlay = (event: Event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      info ??= read();
      kind = event.target instanceof HTMLVideoElement ? "watch" : "listen";
      if (event.target instanceof HTMLVideoElement) mediaTime = event.target.currentTime;
      save();
    };
    let lastTick = 0;
    const onTime = (event: Event) => {
      if (!(event.target instanceof HTMLVideoElement) || Date.now() - lastTick < 3000) return;
      lastTick = Date.now();
      mediaTime = event.target.currentTime;
      if (kind === "watch") save();
    };
    const onPause = (event: Event) => {
      if (event.target instanceof HTMLVideoElement && kind === "watch") { mediaTime = event.target.currentTime; save(); }
    };
    const onHide = () => { if (document.visibilityState === "hidden" && saved) save(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("play", onPlay, true);
    document.addEventListener("timeupdate", onTime, true);
    document.addEventListener("pause", onPause, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(start); window.clearTimeout(timer); window.clearTimeout(back);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("timeupdate", onTime, true);
      document.removeEventListener("pause", onPause, true);
      document.removeEventListener("visibilitychange", onHide);
      if (saved) save();
    };
  }, [location.pathname, location.state, signedIn]);
  return null;
}

/** Բաժնի ցանկում գտնում է նյութը, թերթում մինչև այն և մի պահ վառում։ false, եթե ցանկում (դեռ) չկա։ */
function showInList(path: string) {
  const list = document.querySelector('[aria-labelledby="category-materials-title"]');
  const link = [...(list?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])].find((item) => new URL(item.href).pathname === path);
  if (!link) return false;
  list?.querySelectorAll("[data-found]").forEach((element) => element.removeAttribute("data-found"));
  link.setAttribute("data-found", "current");
  link.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  window.setTimeout(() => link.removeAttribute("data-found"), 3200);
  return true;
}

/**
 * Բաժնի էջում. «Վերջինը կարդացել/լսել/դիտել եք՝ Սաղմոս 25»։ Միայն մուտք գործածների համար։
 * - Սեղմում քարտի վրա. ցանկում իջնում է մինչև այդ նյութը (տեսանյութի դեպքում՝ բացում է էջը, և
 *   տեսանյութը պատրաստ է նույն րոպեից)։
 * - Սլաք. բացում է նյութը նույն տեղից (տեսանյութը՝ միանգամից շարունակվում է)։
 * - ✕. մոռանում է։
 */
export function ContinueCard({ section, className = "" }: { section: string; className?: string }) {
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const [place, setPlace] = useState<LastPlace | null>(null);
  useEffect(() => setPlace(signedIn ? lastPlace(section) : null), [section, signedIn]);
  if (!place) return null;
  const watch = place.kind === "watch" && typeof place.mediaTime === "number";
  const Icon = watch ? PlayCircle : place.kind === "listen" ? Headphones : BookOpen;
  const label = watch ? `Վերջինը դիտել եք · կանգնել եք ${formatMediaTime(place.mediaTime ?? 0)}-ին` : place.kind === "listen" ? "Վերջինը լսել եք" : "Վերջինը կարդացել եք";
  const open = (play: boolean) => navigate(place.path, { state: watch ? { mediaTime: place.mediaTime, play } : { resume: place.progress } });
  const onBody = () => { if (watch || !showInList(place.path)) open(false); };
  return (
    <div className={`continue-card paper-panel relative flex items-center gap-3 py-2.5 pr-2.5 pl-3 ${className}`}>
      <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-ink" type="button" onClick={onBody}
        aria-label={watch ? `Բացել՝ ${place.title}` : `Ցույց տալ ցանկում՝ ${place.title}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright"><Icon aria-hidden="true" size={18} /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="line-clamp-1 text-[11.5px] text-muted">{label} · {timeAgo(place.at)}</span>
          <strong className="line-clamp-1 text-[15px]">{place.title}</strong>
          <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[rgb(217_181_111/18%)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#e2c27e,#b07d2e)]" style={{ width: `${Math.max(6, Math.round(place.progress * 100))}%` }} />
          </span>
        </span>
      </button>
      <button className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708] shadow-[0_6px_16px_rgb(150_100_30/25%)]" type="button"
        onClick={() => open(true)} aria-label={watch ? "Շարունակել դիտելը" : "Բացել և շարունակել"}><ChevronRight aria-hidden="true" size={19} strokeWidth={2.2} /></button>
      <button className="absolute -top-1.5 -right-1.5 grid size-6 cursor-pointer place-items-center rounded-full border border-edge bg-[var(--page-bg)] text-faint shadow-card" type="button"
        onClick={() => { forgetPlace(place.section); setPlace(null); }} aria-label="Մոռանալ"><X aria-hidden="true" size={12} /></button>
    </div>
  );
}
