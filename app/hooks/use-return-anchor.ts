import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Բաժնից նյութ բացելիս հիշում է՝ որ հղումն էր սեղմված և էկրանի որ բարձրության վրա։ Վերադառնալիս
 * էջը ամրացնում է նույն հղման վրա (ոչ թե պիքսելային դիրքի)։ Առաջ վերևի մասը (անձնական տվյալներ,
 * նկար) ուշ էր փոխում բարձրությունը, Chrome-ը դիրքը «ուղղում» էր, ու ամեն վերադարձից էջը մի քիչ ներքև
 * էր գնում։ Ընթերցողը ինքը ոլորելուն պես ամրացումը դադարում է։
 */
const KEY = "section-return-anchor";
const MAX_AGE_MS = 30 * 60_000;

type Anchor = { page: string; href: string; top: number; at: number };

export function useReturnAnchor() {
  const location = useLocation();

  useEffect(() => {
    const page = location.pathname;
    const remember = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("main a[href]") : null;
      if (!link || link.origin !== window.location.origin || link.pathname === page) return;
      const anchor: Anchor = { page, href: link.pathname, top: link.getBoundingClientRect().top, at: Date.now() };
      try { sessionStorage.setItem(KEY, JSON.stringify(anchor)); } catch { /* պահեստը փակ է */ }
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, [location.pathname]);

  useEffect(() => {
    let anchor: Anchor | null = null;
    try { anchor = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Anchor | null; } catch { anchor = null; }
    if (!anchor || anchor.page !== location.pathname || Date.now() - anchor.at > MAX_AGE_MS) return;
    const saved = anchor;
    let stopped = false;
    const stop = () => { stopped = true; };
    const align = () => {
      if (stopped) return;
      const link = [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")].find((item) => item.pathname === saved.href);
      if (!link) return;
      const delta = link.getBoundingClientRect().top - saved.top;
      if (Math.abs(delta) > 2) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
    };
    // React Router-ի դիրքի վերականգնումից հետո, ապա՝ մի քանի անգամ, մինչև ուշ եկող մասերը տեղավորվեն։
    const frame = requestAnimationFrame(align);
    const timers = [150, 400, 900].map((ms) => window.setTimeout(align, ms));
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [location.key, location.pathname]);
}
