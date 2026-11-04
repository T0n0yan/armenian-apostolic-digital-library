import { Copy, HelpCircle, Highlighter, PencilLine, Play, Share2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useRouteLoaderData } from "react-router";

import { HighlightSheet, highlightRequest } from "./highlight-sheet";
import { shareLink } from "./share-button";
import { SignInSheet } from "./sign-in-sheet";
import {
  anchorFor, findQuote, highlightCopyText, mergeSpans, sentenceAt, toggleSentence, QUOTE_MAX, type Highlight, type HighlightKind, type Span,
} from "../utils/highlights";
import {
  buildTextMap, glossaryHit, highlightRegistry, highlightRoot, offsetOf, rangeFor, rangeHit, readingBodies,
} from "../utils/highlight-dom";

type Source = { quote: string; prefix: string; suffix: string };
type Painted = { item: Highlight; range: Range };
type Pending = { materialId: string; kind: HighlightKind; sources: Source[] };
/** Սաղմոսի տողի հնարավորությունները (համարը, ձայնը, համարի էջը)։ */
type Psalm = { verse: number; audio: boolean; path: string | null } | null;
type Place = { top: number; left: number; width: number; arrow: number; above: boolean };
const PENDING_KEY = "pending-highlight";
const HINT_KEY = "highlight-hint";
const POPUP_WIDTH = 360;

function readPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    return value && Array.isArray(value.sources) ? value : null;
  } catch { return null; }
}
function writePending(value: Pending | null) {
  try { if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); else sessionStorage.removeItem(PENDING_KEY); } catch { /* պահեստը փակ է */ }
}

/** Սեղմված կետը տեքստում (բրաուզերների երկու ձևով)։ */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function psalmAt(node: Node): Psalm {
  const element = node instanceof Element ? node : node.parentElement;
  const line = element?.closest<HTMLElement>("[data-verse]");
  const lines = element?.closest<HTMLElement>(".psalm-lines");
  const verse = Number(line?.dataset.verse);
  if (!line || !lines || !Number.isInteger(verse) || verse < 1) return null;
  return { verse, audio: lines.dataset.psalmAudio === "1", path: lines.dataset.psalmPath ? `${lines.dataset.psalmPath}/${verse}` : null };
}

/** Պատուհանի տեղը՝ նախադասության վերջի տակ (տեղ չլինելու դեպքում՝ վերևում), սլաքով դեպի վերջը։ */
function placeAt(range: Range): Place | null {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
  const last = rects[rects.length - 1];
  if (!last) return null;
  const width = Math.min(POPUP_WIDTH, window.innerWidth - 24);
  const point = last.right - 6;
  const left = Math.min(Math.max(12, point - width / 2), window.innerWidth - width - 12);
  const above = last.bottom > window.innerHeight - 150 && last.top > 150;
  return {
    top: window.scrollY + (above ? last.top - 12 : last.bottom + 12),
    left: left + window.scrollX, width, above,
    arrow: Math.min(Math.max(point - left, 22), width - 22),
  };
}

/**
 * Նշումներ տեքստում (կայքի բոլոր նյութերում, `.reading-body`-ի մեջ)։
 * - Սեղմում նախադասության վրա (վերջակետից վերջակետ) ընտրում է այն, և նախադասության վերջում բացվում
 *   է փոքր պատուհան՝ Պահել · ❓ Հարց · Պատճենել (սաղմոսում՝ նաև Լսել, Կիսվել)։ Կարելի է ընտրել մի
 *   քանի նախադասություն՝ ցանկացած տեղից, ցանկացած հերթով. ընտրվածի վրա նորից սեղմելը հանում է այն։
 * - Երկար սեղմումով ընտրությունը պահվում է հենց այնպես, ինչպես նշել է մարդը. պատուհանը մնում է,
 *   նույնիսկ երբ բրաուզերը մաքրում է ընտրությունը (Google-ի պատուհանը փակելիս)։
 * - Պահվածները ներկվում են CSS Highlight API-ով։ Պահված տողի վրա սեղմելը բացում է նշման քարտը,
 *   բառարանի բառի վրա սեղմելը՝ բառարանը։
 */
export function HighlightLayer() {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  const signedIn = Boolean(rootData?.signedIn);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [items, setItems] = useState<Highlight[]>([]);
  const [spans, setSpans] = useState<Span[]>([]);
  const [focus, setFocus] = useState<Span | null>(null);
  const [psalm, setPsalm] = useState<Psalm>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [open, setOpen] = useState<Highlight | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [toast, setToast] = useState<{ text: string; item?: Highlight } | null>(null);
  const [busy, setBusy] = useState(false);
  const painted = useRef<Painted[]>([]);
  const spansRef = useRef<Span[]>([]);
  const lastTap = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  spansRef.current = spans;

  const showToast = useCallback((text: string, item?: Highlight, ms = 3500) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, item });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const clearSpans = useCallback(() => {
    setSpans([]); setFocus(null); setPsalm(null);
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }, []);

  // Ո՞ր նյութի էջում ենք (article[data-highlight-material])։
  useEffect(() => {
    const find = () => setMaterialId(highlightRoot()?.dataset.highlightMaterial ?? null);
    find();
    const timer = window.setTimeout(find, 300);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => { setItems([]); setSpans([]); setFocus(null); setPsalm(null); setOpen(null); }, [materialId]);

  // Առաջին անգամ՝ մեկ հուշում, թե ինչպես նշել։
  useEffect(() => {
    if (!materialId) return;
    const timer = window.setTimeout(() => {
      const root = highlightRoot();
      if (!root || !readingBodies(root).length) return;
      try { if (localStorage.getItem(HINT_KEY)) return; localStorage.setItem(HINT_KEY, "1"); } catch { return; }
      showToast("👆 Սեղմեք նախադասության վրա՝ այն պահելու կամ հարց նշելու համար", undefined, 6500);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [materialId, showToast]);

  // Այս նյութի նշումները. մուտքից հետո պահում է նաև մուտքից առաջ ընտրվածը։
  useEffect(() => {
    if (!materialId || !signedIn) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/highlights?materialId=${encodeURIComponent(materialId)}`).catch(() => null);
      const data = (await response?.json().catch(() => null)) as { highlights?: Highlight[] } | null;
      if (cancelled) return;
      setItems(data?.highlights ?? []);
      const saved = readPending();
      if (saved?.materialId !== materialId) return;
      writePending(null);
      const created: Highlight[] = [];
      for (const source of saved.sources) {
        const result = await highlightRequest({ action: "create", materialId, kind: saved.kind, ...source });
        if (result?.ok && result.highlight) created.push(result.highlight);
      }
      if (cancelled || !created.length) return;
      setItems((current) => [...current, ...created.filter((item) => !current.some((old) => old.id === item.id))]);
      if (saved.kind === "question") setOpen(created[created.length - 1]); else showToast("Պահված է ✓", created[created.length - 1]);
    })();
    return () => { cancelled = true; };
  }, [materialId, signedIn, showToast]);

  // Ներկում է պահված տողերը. կրկնում է, երբ էջի տեքստը փոխվում է (օր.՝ բեռնվում է ուշ)։
  useEffect(() => {
    const registry = highlightRegistry();
    const root = materialId ? highlightRoot() : null;
    if (!registry || !root) { painted.current = []; return; }
    const paint = () => {
      const map = buildTextMap(readingBodies(root));
      const next: Painted[] = [];
      for (const item of items) {
        const found = findQuote(map.text, item);
        const range = found ? rangeFor(map, found.start, found.end) : null;
        if (range) next.push({ item, range });
      }
      painted.current = next;
      const marks = next.filter((entry) => entry.item.kind === "mark").map((entry) => entry.range);
      const questions = next.filter((entry) => entry.item.kind === "question").map((entry) => entry.range);
      if (marks.length) registry.set("user-mark", new Highlight(...marks)); else registry.delete("user-mark");
      if (questions.length) registry.set("user-question", new Highlight(...questions)); else registry.delete("user-question");
    };
    paint();
    let timer: number | undefined;
    const observer = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(paint, 250); });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); window.clearTimeout(timer); registry.delete("user-mark"); registry.delete("user-question"); };
  }, [items, materialId]);

  // Ընտրված (դեռ չպահված) նախադասությունները և պատուհանի տեղը՝ վերջին ընտրվածի վերջում։
  useLayoutEffect(() => {
    const registry = highlightRegistry();
    const root = highlightRoot();
    if (!spans.length || !root) { registry?.delete("user-pending"); setPlace(null); return; }
    const map = buildTextMap(readingBodies(root));
    const ranges = spans.map((span) => rangeFor(map, span.start, span.end)).filter((range): range is Range => Boolean(range));
    if (registry && ranges.length) registry.set("user-pending", new Highlight(...ranges));
    const target = focus && spans.some((span) => span.start === focus.start && span.end === focus.end) ? focus : spans[spans.length - 1];
    const range = rangeFor(map, target.start, target.end);
    setPlace(range ? placeAt(range) : null);
    const onResize = () => { const again = rangeFor(buildTextMap(readingBodies(root)), target.start, target.end); setPlace(again ? placeAt(again) : null); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); registry?.delete("user-pending"); };
  }, [spans, focus]);

  // «Իմ նշումները»-ից եկած հղումը (?hl=…). թերթում է մինչև տողը և մի պահ վառում այն։
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("hl");
    if (!id || !items.length) return;
    const timer = window.setTimeout(() => {
      const entry = painted.current.find((item) => item.item.id === id);
      if (!entry) return;
      const rect = entry.range.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const registry = highlightRegistry();
      registry?.set("user-flash", new Highlight(entry.range));
      window.setTimeout(() => registry?.delete("user-flash"), 2600);
      const url = new URL(window.location.href);
      url.searchParams.delete("hl");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [items, location.search]);

  // Երկար սեղմումով ընտրություն՝ հենց այնպես, ինչպես նշել է մարդը։ Ընտրությունը մաքրվելիս պատուհանը մնում է։
  useEffect(() => {
    if (!materialId) return;
    let timer: number | undefined;
    const read = () => {
      const selection = window.getSelection();
      const root = highlightRoot();
      const range = selection && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      const bodies = root ? readingBodies(root) : [];
      const inside = (node: Node) => bodies.some((body) => body.contains(node));
      if (!range || !inside(range.startContainer) || !inside(range.endContainer)) return;
      // Մեր սեղմումից անմիջապես հետո բրաուզերի ընտրած բառը չի փոխարինում նախադասությանը։
      if (Date.now() - lastTap.current < 800) return;
      const map = buildTextMap(bodies);
      const start = offsetOf(map, range.startContainer, range.startOffset);
      const end = offsetOf(map, range.endContainer, range.endOffset);
      if (start === null || end === null || end - start < 2) return;
      const anchor = anchorFor(map.text, start, end);
      if (anchor.quote.length < 2) return;
      const span = { start: anchor.start, end: anchor.end };
      setSpans([span]); setFocus(span); setPsalm(psalmAt(range.startContainer));
    };
    const onChange = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 150); };
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); window.clearTimeout(timer); };
  }, [materialId]);

  // Սեղմում տեքստի վրա։
  useEffect(() => {
    if (!materialId) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("[data-highlight-bar], [data-glossary-card], [role='dialog']")) return;
      const root = highlightRoot();
      const bodies = root ? readingBodies(root) : [];
      const body = target.closest(".reading-body");
      if (!body || !bodies.includes(body as HTMLElement)) { if (spansRef.current.length) clearSpans(); return; }
      if (window.getSelection()?.toString().trim()) return;
      if (target.closest("a, button, input, textarea")) return;
      const { clientX: x, clientY: y } = event;
      if (glossaryHit(x, y)) return;
      const hit = painted.current.find((entry) => rangeHit(entry.range, x, y));
      if (hit && !spansRef.current.length) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(hit.item);
        return;
      }
      const caret = caretAt(x, y);
      if (!caret) return;
      const map = buildTextMap(bodies);
      const offset = offsetOf(map, caret.node, caret.offset);
      const sentence = offset === null ? null : sentenceAt(map.text, offset);
      if (!sentence) return;
      const next = toggleSentence(spansRef.current, sentence);
      const added = next.length > spansRef.current.length;
      lastTap.current = Date.now();
      // Էջը փոխվում է հենց սեղմման պահին. այդ դեպքում Chrome-ը չի բացում իր «Touch to Search»-ը։
      flushSync(() => {
        setSpans(next);
        setFocus(added ? sentence : next[next.length - 1] ?? null);
        setPsalm(added ? psalmAt(caret.node) : next.length ? psalm : null);
      });
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && spansRef.current.length) clearSpans(); };
    // Բառարանի պատուհանից «Բացել նշումը»։
    const onOpenAt = (event: Event) => {
      const range = (event as CustomEvent<Range>).detail;
      const hit = painted.current.find((entry) => entry.range.isPointInRange(range.startContainer, range.startOffset));
      if (hit) setOpen(hit.item);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("highlight-open-at", onOpenAt);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("highlight-open-at", onOpenAt);
    };
  }, [materialId, clearSpans, psalm]);

  /** Ընտրվածների տեքստը. իրար կպածները՝ մեկ կտոր։ */
  const sources = (): Source[] => {
    if (!spans.length || typeof document === "undefined") return [];
    const root = highlightRoot();
    if (!root) return [];
    const map = buildTextMap(readingBodies(root));
    return mergeSpans(spans, map.text).map((span) => anchorFor(map.text, span.start, span.end))
      .filter((anchor) => anchor.quote).map(({ quote, prefix, suffix }) => ({ quote, prefix, suffix }));
  };

  const save = async (kind: HighlightKind) => {
    const list = sources();
    if (!list.length || !materialId || busy) return;
    if (!signedIn) {
      writePending({ materialId, kind, sources: list });
      setAskSignIn(true);
      return;
    }
    setBusy(true);
    const created: Highlight[] = [];
    let limit = false;
    for (const source of list) {
      const result = await highlightRequest({ action: "create", materialId, kind, ...source });
      if (result?.ok && result.highlight) created.push(result.highlight);
      else if (result?.reason === "limit") limit = true;
    }
    setBusy(false);
    if (!created.length) {
      showToast(limit ? "Նշումների թիվը հասել է սահմանին (2000)։ Ջնջեք հներից մի քանիսը։" : "Չհաջողվեց պահել. ստուգեք կապը։");
      return;
    }
    clearSpans();
    setItems((current) => [...current, ...created.filter((item) => !current.some((old) => old.id === item.id))]);
    if (kind === "question") setOpen(created[created.length - 1]); else showToast("Պահված է ✓", created[created.length - 1]);
  };

  const copy = async () => {
    const list = sources();
    if (!list.length) return;
    const root = highlightRoot();
    const text = highlightCopyText({ quote: list.map((source) => source.quote).join("\n"), title: root?.dataset.highlightTitle ?? "", path: root?.dataset.highlightPath ?? window.location.pathname }, window.location.origin);
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
    clearSpans();
    showToast(ok ? "Պատճենված է ✓" : "Չհաջողվեց պատճենել");
  };

  const share = async () => {
    if (!psalm?.path) return;
    const outcome = await shareLink(`${window.location.origin}${psalm.path}`);
    clearSpans();
    if (outcome === "copied") showToast("Հղումը պատճենվեց");
  };

  const listen = () => {
    if (!psalm) return;
    window.dispatchEvent(new CustomEvent("psalm-listen", { detail: { verse: psalm.verse } }));
    clearSpans();
  };

  const length = sources().reduce((total, source) => total + source.quote.length, 0);
  const tooLong = spans.length > 0 && sources().some((source) => source.quote.length > QUOTE_MAX);
  const single = spans.length === 1;
  const icon = "grid size-10 shrink-0 cursor-pointer place-items-center rounded-[14px] border-0 bg-subtle text-ink disabled:opacity-50";
  const main = "inline-flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[14px] border-0 px-1.5 text-[13px] font-bold text-ink disabled:cursor-default disabled:opacity-50";

  if (typeof document === "undefined") return null;
  return (
    <>
      {spans.length && place && !open ? createPortal(
        <div className="absolute z-[2040]" style={{ top: place.top, left: place.left, width: place.width, transform: place.above ? "translateY(-100%)" : undefined }} data-highlight-bar>
          <div className="highlight-pop relative" data-side={place.above ? "above" : "below"} style={{ transformOrigin: `${place.arrow}px ${place.above ? "100%" : "0"}` }}>
            <span className="absolute size-3.5 rotate-45 border-[rgb(217_181_111/55%)] bg-[var(--page-bg)]" aria-hidden="true"
              style={{ left: place.arrow - 7, ...(place.above ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 } : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }) }} />
            <div className="relative grid gap-1.5 rounded-[18px] border border-[rgb(217_181_111/55%)] bg-[var(--page-bg)] p-1.5 shadow-[0_16px_40px_rgb(40_20_10/26%)] select-none" role="toolbar" aria-label="Նշել ընտրվածը"
              onMouseDown={(event) => event.preventDefault()}>
              {tooLong ? <p className="m-0 px-1 text-center text-[11.5px] text-muted">Շատ երկար է. ընտրեք ավելի կարճ (մինչև {QUOTE_MAX} նշան)։</p> : null}
              <div className="flex items-center gap-1">
                <button className={`${main} bg-[rgb(250_214_92/34%)]`} type="button" disabled={tooLong || busy} onClick={() => void save("mark")}><Highlighter aria-hidden="true" size={17} /> Պահել</button>
                <button className={`${main} bg-[rgb(120_165_230/22%)]`} type="button" disabled={tooLong || busy} onClick={() => void save("question")}><HelpCircle aria-hidden="true" size={17} /> Հարց</button>
                <button className={icon} type="button" onClick={() => void copy()} aria-label="Պատճենել" title="Պատճենել"><Copy aria-hidden="true" size={17} /></button>
                {single && psalm?.path ? <button className={icon} type="button" onClick={() => void share()} aria-label="Կիսվել համարով" title="Կիսվել"><Share2 aria-hidden="true" size={17} /></button> : null}
                {single && psalm?.audio ? <button className={`${icon} bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" onClick={listen} aria-label="Լսել այստեղից" title="Լսել այստեղից"><Play aria-hidden="true" size={17} /></button> : null}
                <button className={`${icon} bg-transparent text-muted`} type="button" onClick={clearSpans} aria-label="Փակել" title="Փակել"><X aria-hidden="true" size={18} /></button>
              </div>
              {spans.length > 1 ? <p className="m-0 text-center text-[11px] text-faint">Ընտրված է {spans.length} նախադասություն · {length} նշան</p> : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {toast && !spans.length && !open ? createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tg-inset-bottom,0px)+16px)] z-[2040] flex justify-center px-3" role="status" data-highlight-bar>
          <div className="highlight-bar pointer-events-auto flex max-w-[440px] items-center gap-2 rounded-full border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] py-1.5 pr-1.5 pl-4 text-[13px] text-ink shadow-[0_14px_36px_rgb(40_20_10/24%)]">
            <span className="py-1.5">{toast.text}</span>
            {toast.item ? (
              <button className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full border-0 bg-[rgb(217_181_111/16%)] px-3 text-[12.5px] font-bold text-gold-bright" type="button"
                onClick={() => { setOpen(toast.item ?? null); setToast(null); }}><PencilLine aria-hidden="true" size={14} /> Նոթ</button>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}

      <HighlightSheet item={open} onClose={() => setOpen(null)}
        onChange={(changed) => setItems((current) => current.map((item) => item.id === changed.id ? changed : item))}
        onDelete={(id) => setItems((current) => current.filter((item) => item.id !== id))} />
      <SignInSheet open={askSignIn} onClose={() => { setAskSignIn(false); writePending(null); }} reason="պահեք Ձեր նշումները և հարցերը" hint="Կարդալ կարելի է առանց մուտքի։ Մուտքից հետո ընտրվածը կպահվի ինքնաբերաբար։" />
    </>
  );
}
