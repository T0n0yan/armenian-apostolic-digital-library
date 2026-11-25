import { useEffect } from "react";

import { foldedMatches } from "../../shared/telegram-search";

/**
 * Found in a search, then opened: the words searched for light up on the opened page for a few
 * seconds and slowly fade, so the reader sees at once where they are. The search remembers the
 * words with the link that was tapped; the page lights them up once.
 */
const KEY = "library-find-flash";
const FRESH_MS = 2 * 60_000;

type Remembered = { query: string; path: string; at: number };

/** While a search shows results, a tap on a result link remembers the words for that page. */
export function useRememberFind(query: string) {
  useEffect(() => {
    const words = query.trim();
    if (!words) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.origin !== window.location.origin || link.closest("nav, header")) return;
      try { sessionStorage.setItem(KEY, JSON.stringify({ query: words, path: link.pathname, at: Date.now() } satisfies Remembered)); } catch { /* private mode */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [query]);
}

function readRemembered(path: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Remembered | null;
    return saved && saved.path === path && Date.now() - saved.at <= FRESH_MS ? saved : null;
  } catch { return null; }
}

/** Whether this page was opened from a search that lights its words up (the flash replaces the old block highlight). */
export function hasRememberedFind(path: string) {
  return typeof window !== "undefined" && readRemembered(path) !== null;
}

// Forgotten only once the flash has run its course, so a page drawn twice (React's checks) still shows it.
function forget() {
  try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// Painted by the browser over the text (CSS Custom Highlight API), never by changing the page:
// changing React's text nodes made the page redraw itself. Held, then faded in steps (app.css).
const HOLD_MS = 1_100;
const FADE_STEPS = 6;
const STEP_MS = 320;

/** Lights up the remembered words inside `selector` on arrival at `path`, then fades them away. */
export function useFindFlash(path: string, selector: string) {
  useEffect(() => {
    const saved = readRemembered(path);
    const root = document.querySelector(selector);
    if (!saved?.query.trim() || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest("button, input, textarea, [aria-hidden='true']") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const ranges: Range[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // Հին և նոր ուղղագրությունը համեմատվում են (անիրավ = անիրաւ, Տեր = Տէր, թյուն = թիւն)։
      for (const match of foldedMatches((node as Text).data, saved.query)) {
        const range = document.createRange();
        range.setStart(node, match.start);
        range.setEnd(node, match.end);
        ranges.push(range);
      }
    }
    if (!ranges.length) { forget(); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = ranges[0].getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + first.top - window.innerHeight / 2), behavior: reduced ? "auto" : "smooth" });
    const highlights = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
    const HighlightClass = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!highlights || !HighlightClass) { forget(); return; }
    const paint = new HighlightClass(...ranges);
    const names = Array.from({ length: FADE_STEPS + 1 }, (_, step) => `find-flash-${step}`);
    const show = (step: number) => { names.forEach((name) => highlights.delete(name)); if (step <= FADE_STEPS) highlights.set(names[step], paint); };
    show(0);
    const timers = names.map((_, step) => window.setTimeout(() => { show(step + 1); if (step === FADE_STEPS) forget(); }, HOLD_MS + step * STEP_MS));
    return () => { timers.forEach(window.clearTimeout); names.forEach((name) => highlights.delete(name)); };
  }, [path, selector]);
}
