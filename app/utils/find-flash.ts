import { useEffect } from "react";

/**
 * Found in a search, then opened: the words searched for light up on the opened page for a few
 * seconds and slowly fade, so the reader sees at once where they are. The search remembers the
 * words with the link that was tapped; the page lights them up once.
 */
const KEY = "library-find-flash";
const FRESH_MS = 2 * 60_000;
const FLASH_MS = 7_000;

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

// Forgotten only once the flash has run its course, so a page drawn twice (React's checks) still shows it.
function forget() {
  try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The words (2+ letters, longest first) as one pattern; «և» and «եւ» are the same letter. */
export function findPattern(query: string) {
  const words = [...new Set(query.normalize("NFC").trim().split(/\s+/u).filter((word) => [...word].length >= 2))]
    .sort((a, b) => b.length - a.length)
    .map((word) => escape(word).replace(/և|եւ/gu, "(?:և|եւ)"));
  return words.length ? new RegExp(words.join("|"), "giu") : null;
}

/** Lights up the remembered words inside `selector` on arrival at `path`, then puts the text back as it was. */
export function useFindFlash(path: string, selector: string) {
  useEffect(() => {
    const saved = readRemembered(path);
    const pattern = saved ? findPattern(saved.query) : null;
    const root = document.querySelector(selector);
    if (!pattern || !root) return;
    const marks: HTMLElement[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest("button, input, textarea, mark, [aria-hidden='true']") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    for (const node of nodes) {
      const text = node.data;
      pattern.lastIndex = 0;
      const ranges = [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length] as const);
      // From the end, so earlier offsets stay right while the node is split.
      for (const [start, end] of ranges.reverse()) {
        const word = node.splitText(start);
        word.splitText(end - start);
        const mark = document.createElement("mark");
        mark.className = "find-flash";
        word.replaceWith(mark);
        mark.appendChild(word);
        marks.unshift(mark);
      }
    }
    if (!marks.length) { forget(); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = window.requestAnimationFrame(() => marks[0].scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }));
    const restore = () => {
      for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        mark.replaceWith(...Array.from(mark.childNodes));
        parent.normalize();
      }
    };
    const done = window.setTimeout(() => { forget(); restore(); }, FLASH_MS);
    return () => { window.cancelAnimationFrame(first); window.clearTimeout(done); restore(); };
  }, [path, selector]);
}
