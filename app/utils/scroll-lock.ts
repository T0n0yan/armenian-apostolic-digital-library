import { useEffect } from "react";

/**
 * Էջի ոլորումը կանգնեցնել, մինչև մոդալը բաց է (iPhone-ում էլ, որտեղ `overflow: hidden`-ը բավական չէ)։
 * Մի քանի մոդալ միաժամանակ՝ հաշվիչով. էջը բացվում է միայն վերջինը փակվելիս, նույն տեղում։
 */
let locks = 0;
let saved: { y: number; html: string; body: string } | null = null;

export function lockScroll() {
  if (typeof document === "undefined") return () => undefined;
  locks += 1;
  if (locks === 1) {
    const { body, documentElement: html } = document;
    const y = window.scrollY;
    saved = { y, html: html.style.cssText, body: body.style.cssText };
    // Ոլորման գծի լայնությունը պահում ենք, որ էջը կողքի չցատկի։
    const gap = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    Object.assign(body.style, { position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%", overflow: "hidden", paddingRight: gap > 0 ? `${gap}px` : body.style.paddingRight });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      document.documentElement.style.cssText = saved.html;
      document.body.style.cssText = saved.body;
      window.scrollTo({ top: saved.y, behavior: "instant" as ScrollBehavior });
      saved = null;
    }
  };
}

/** Մինչ `active`-ը true է, էջը չի ոլորվում։ */
export function useScrollLock(active: boolean) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}
