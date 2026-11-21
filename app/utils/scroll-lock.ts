import { useEffect } from "react";

/**
 * Էջի ոլորումը կանգնեցնել, մինչև մոդալը բաց է (iPhone-ում էլ, որտեղ `overflow: hidden`-ը բավական չէ)։
 * Մի քանի մոդալ միաժամանակ՝ հաշվիչով. էջը բացվում է միայն վերջինը փակվելիս, նույն տեղում։
 */
let locks = 0;
type Saved = Record<string, string>;
let saved: { y: number; html: Saved; body: Saved } | null = null;

const HTML_KEYS = ["overflow", "overscrollBehavior"] as const;
const BODY_KEYS = ["position", "top", "left", "right", "width", "overflow", "paddingRight"] as const;

// Պահում ենք միայն մեր փոխած հատկությունները։ Ամբողջ `style`-ը (cssText) հետ դնելը ջնջում էր
// մոդալը բաց եղած ժամանակ դրվածը, օր.՝ մենյուում փոխված տառաչափը (`--reading-size`)։
function remember(style: CSSStyleDeclaration, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, style[key as keyof CSSStyleDeclaration] as string]));
}
function restore(style: CSSStyleDeclaration, values: Saved) {
  Object.assign(style, values);
}

export function lockScroll() {
  if (typeof document === "undefined") return () => undefined;
  locks += 1;
  if (locks === 1) {
    const { body, documentElement: html } = document;
    const y = window.scrollY;
    saved = { y, html: remember(html.style, HTML_KEYS), body: remember(body.style, BODY_KEYS) };
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
      restore(document.documentElement.style, saved.html);
      restore(document.body.style, saved.body);
      window.scrollTo({ top: saved.y, behavior: "instant" as ScrollBehavior });
      saved = null;
    }
  };
}

/** Մինչ `active`-ը true է, էջը չի ոլորվում։ */
export function useScrollLock(active: boolean) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}
