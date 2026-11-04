import { Copy, HelpCircle, Highlighter, PencilLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useRouteLoaderData } from "react-router";

import { HighlightSheet, highlightRequest } from "./highlight-sheet";
import { SignInSheet } from "./sign-in-sheet";
import {
  anchorFor, extendSelection, findQuote, highlightCopyText, sentenceAt, QUOTE_MAX, type Highlight, type HighlightKind,
} from "../utils/highlights";
import {
  buildTextMap, glossaryHit, highlightRegistry, highlightRoot, offsetOf, rangeFor, rangeHit, readingBodies,
} from "../utils/highlight-dom";

type Span = { start: number; end: number };
type Source = { quote: string; prefix: string; suffix: string; verse?: number };
type Painted = { item: Highlight; range: Range };
type Pending = Source & { materialId: string; kind: HighlightKind };
const PENDING_KEY = "pending-highlight";
const HINT_KEY = "highlight-hint";

function readPending(): Pending | null {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null"); } catch { return null; }
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

/**
 * Նշումներ տեքստում (կայքի բոլոր նյութերում, `.reading-body`-ի մեջ)։
 * - Մեկ սեղմում նախադասության վրա ընտրում է այն (հարևանը՝ ավելացնում, նորից սեղմելը՝ հանում).
 *   այսպես բրաուզերի ընտրություն և Google-ի «Touch to Search» պատուհան պետք չէ։
 * - Երկար սեղմելով ընտրությունը նույնպես աշխատում է. վահանակը մնում է, նույնիսկ երբ
 *   բրաուզերը մաքրում է ընտրությունը (օր.՝ Google-ի պատուհանը փակելիս)։
 * - Պահվածները ներկվում են CSS Highlight API-ով (DOM-ը չի փոխվում)։ Պահված տողի վրա սեղմելը բացում
 *   է նշման քարտը. բառարանի բառի վրա սեղմելը՝ բառարանը։ Սաղմոսի համարը բացում է իր պատուհանը։
 */
export function HighlightLayer() {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  const signedIn = Boolean(rootData?.signedIn);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [items, setItems] = useState<Highlight[]>([]);
  const [pending, setPending] = useState<Span | null>(null);
  const [native, setNative] = useState(false);
  const [open, setOpen] = useState<Highlight | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [toast, setToast] = useState<{ text: string; item?: Highlight } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const painted = useRef<Painted[]>([]);
  const pendingRef = useRef<Span | null>(null);
  const lastTap = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  pendingRef.current = pending;

  const showToast = useCallback((text: string, item?: Highlight, ms = 4500) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, item });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const clearPending = useCallback(() => {
    setPending(null);
    setNative(false);
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

  // Առաջին անգամ՝ մեկ հուշում, թե ինչպես նշել։
  useEffect(() => {
    if (!materialId) return;
    const timer = window.setTimeout(() => {
      const root = highlightRoot();
      if (!root || !readingBodies(root).length) return;
      try { if (localStorage.getItem(HINT_KEY)) return; localStorage.setItem(HINT_KEY, "1"); } catch { return; }
      showToast("👆 Սեղմեք նախադասության վրա՝ պահելու կամ հարց նշելու համար", undefined, 6500);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [materialId, showToast]);

  // Այս նյութի նշումները. մուտքից հետո պահում է նաև մուտքից առաջ ընտրված տողը։
  useEffect(() => {
    if (!materialId || !signedIn) { setItems([]); return; }
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/highlights?materialId=${encodeURIComponent(materialId)}`).catch(() => null);
      const data = (await response?.json().catch(() => null)) as { highlights?: Highlight[] } | null;
      if (cancelled) return;
      setItems(data?.highlights ?? []);
      const saved = readPending();
      if (saved?.materialId === materialId) {
        writePending(null);
        const result = await highlightRequest({ action: "create", ...saved });
        if (cancelled || !result?.ok || !result.highlight) return;
        const created = result.highlight;
        setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
        if (created.kind === "question") setOpen(created); else showToast("Պահված է «Իմ նշումները»-ում", created);
      }
    })();
    return () => { cancelled = true; };
  }, [materialId, signedIn, showToast, refresh]);

  // Էջը փոխելիս՝ ամեն ինչ սկզբից։
  useEffect(() => { setItems([]); setPending(null); setNative(false); setOpen(null); }, [materialId]);

  // Սաղմոսի համարի պատուհանը փոխեց նշումները / խնդրում է հարց։
  useEffect(() => {
    const onChanged = () => setRefresh((value) => value + 1);
    window.addEventListener("highlights-changed", onChanged);
    return () => window.removeEventListener("highlights-changed", onChanged);
  }, []);

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

  // Ընտրված (դեռ չպահված) նախադասությունը՝ իր գույնով։
  useEffect(() => {
    const registry = highlightRegistry();
    const root = highlightRoot();
    if (!registry) return;
    if (!pending || !root) { registry.delete("user-pending"); return; }
    const range = rangeFor(buildTextMap(readingBodies(root)), pending.start, pending.end);
    if (range) registry.set("user-pending", new Highlight(range)); else registry.delete("user-pending");
    return () => { registry.delete("user-pending"); };
  }, [pending]);

  // «Նշումներ» էջից եկած հղումը (?hl=…). թերթում է մինչև տողը և մի պահ վառում այն։
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

  // Երկար սեղմումով ընտրություն։ Ընտրությունը մաքրվելիս (Google-ի պատուհանը փակելիս) վահանակը մնում է։
  useEffect(() => {
    if (!materialId) return;
    let timer: number | undefined;
    const read = () => {
      const selection = window.getSelection();
      const root = highlightRoot();
      const range = selection && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      const bodies = root ? readingBodies(root) : [];
      const inside = (node: Node) => bodies.some((body) => body.contains(node));
      if (!range || !inside(range.startContainer) || !inside(range.endContainer)) { setNative(false); return; }
      // Մեր սեղմումից անմիջապես հետո բրաուզերի ընտրած բառը չի փոխարինում նախադասությանը։
      if (Date.now() - lastTap.current < 800) return;
      const map = buildTextMap(bodies);
      const start = offsetOf(map, range.startContainer, range.startOffset);
      const end = offsetOf(map, range.endContainer, range.endOffset);
      if (start === null || end === null || end - start < 2) return;
      const anchor = anchorFor(map.text, start, end);
      if (anchor.quote.length < 2) return;
      setPending({ start: anchor.start, end: anchor.end });
      setNative(true);
    };
    const onChange = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 120); };
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
      if (!body || !bodies.includes(body as HTMLElement)) { if (pendingRef.current) clearPending(); return; }
      if (window.getSelection()?.toString().trim()) return;
      if (target.closest("a, button, input, textarea")) return;
      const { clientX: x, clientY: y } = event;
      if (glossaryHit(x, y)) return;
      const hit = painted.current.find((entry) => rangeHit(entry.range, x, y));
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        setPending(null);
        setOpen(hit.item);
        return;
      }
      // Սաղմոսի համարը բացում է իր պատուհանը (այնտեղ էլ կա «Նշել» և «Հարց»)։
      if (target.closest("[data-verse]")) return;
      const caret = caretAt(x, y);
      if (!caret) return;
      const map = buildTextMap(bodies);
      const offset = offsetOf(map, caret.node, caret.offset);
      const sentence = offset === null ? null : sentenceAt(map.text, offset);
      if (!sentence) return;
      const next = extendSelection(pendingRef.current, sentence, map.text);
      lastTap.current = Date.now();
      // Էջը փոխվում է հենց սեղմման պահին. այդ դեպքում Chrome-ը չի բացում իր «Touch to Search»-ը։
      flushSync(() => { setNative(false); setPending(next ? { start: next.start, end: next.end } : null); });
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && pendingRef.current) clearPending(); };
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
  }, [materialId, clearPending]);

  /** Ընտրվածի տեքստը և շրջակա բառերը։ */
  const selectedSource = (): Source | null => {
    const root = highlightRoot();
    if (!pending || !root) return null;
    const map = buildTextMap(readingBodies(root));
    const anchor = anchorFor(map.text, pending.start, pending.end);
    return anchor.quote ? { quote: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix } : null;
  };

  const save = useCallback(async (kind: HighlightKind, source: Source | null) => {
    if (!source || !materialId || busy) return;
    if (!signedIn) {
      writePending({ ...source, materialId, kind });
      setAskSignIn(true);
      return;
    }
    setBusy(true);
    const result = await highlightRequest({ action: "create", materialId, kind, ...source });
    setBusy(false);
    if (!result?.ok || !result.highlight) {
      showToast(result?.reason === "limit" ? "Նշումների թիվը հասել է սահմանին (2000)։ Ջնջեք հներից մի քանիսը։" : "Չհաջողվեց պահել. ստուգեք կապը։");
      return;
    }
    const created = result.highlight;
    clearPending();
    setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    if (kind === "question") setOpen(created); else showToast("Պահված է «Իմ նշումները»-ում", created);
  }, [busy, clearPending, materialId, showToast, signedIn]);

  // Սաղմոսի համարի պատուհանի «❓ Հարց»-ը։
  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ quote: string; kind: HighlightKind; verse?: number }>).detail;
      if (detail?.quote) void save(detail.kind, { quote: detail.quote.trim().slice(0, QUOTE_MAX), prefix: "", suffix: "", verse: detail.verse });
    };
    window.addEventListener("highlight-request", onRequest);
    return () => window.removeEventListener("highlight-request", onRequest);
  }, [save]);

  const copy = async () => {
    const source = selectedSource();
    if (!source) return;
    const root = highlightRoot();
    const text = highlightCopyText({ quote: source.quote, title: root?.dataset.highlightTitle ?? "", path: root?.dataset.highlightPath ?? window.location.pathname }, window.location.origin);
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
    clearPending();
    showToast(ok ? "Պատճենված է ✓" : "Չհաջողվեց պատճենել");
  };

  const length = pending ? pending.end - pending.start : 0;
  const tooLong = length > QUOTE_MAX;
  const tile = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border-0 px-2 text-[13.5px] font-bold disabled:cursor-default disabled:opacity-50";

  if (typeof document === "undefined") return null;
  return (
    <>
      {pending && !open ? createPortal(
        // Ընտրության ժամանակ՝ վերևում, որ Google-ի ներքևի պատուհանը չծածկի. մնացած դեպքում՝ ներքևում։
        <div className={`pointer-events-none fixed inset-x-0 z-[2040] flex justify-center px-3 ${native ? "top-[calc(var(--tg-inset-top,0px)+10px)]" : "bottom-[calc(var(--tg-inset-bottom,0px)+16px)]"}`} data-highlight-bar>
          <div className="highlight-bar pointer-events-auto grid w-full max-w-[440px] gap-1.5 rounded-[20px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-2 shadow-[0_18px_44px_rgb(40_20_10/28%)] select-none" role="toolbar" aria-label="Նշել ընտրված տողը"
            onMouseDown={(event) => event.preventDefault()}>
            {tooLong ? <p className="m-0 text-center text-[12px] text-muted">Ընտրված կտորը շատ երկար է. ընտրեք ավելի կարճ (մինչև {QUOTE_MAX} նշան)։</p> : null}
            <div className="grid grid-cols-[1fr_1fr_1fr_44px] gap-1.5">
              <button className={`${tile} bg-[rgb(250_214_92/32%)] text-ink`} type="button" disabled={tooLong || busy} onClick={() => void save("mark", selectedSource())}><Highlighter aria-hidden="true" size={17} /> Պահել</button>
              <button className={`${tile} bg-[rgb(120_165_230/22%)] text-ink`} type="button" disabled={tooLong || busy} onClick={() => void save("question", selectedSource())}><HelpCircle aria-hidden="true" size={17} /> Հարց</button>
              <button className={`${tile} bg-subtle text-ink`} type="button" onClick={() => void copy()}><Copy aria-hidden="true" size={17} /> Պատճենել</button>
              <button className={`${tile} bg-transparent text-muted`} type="button" onClick={clearPending} aria-label="Չեղարկել"><X aria-hidden="true" size={19} /></button>
            </div>
            {!native ? <p className="m-0 text-center text-[11px] text-faint">Սեղմեք հարևան նախադասության վրա՝ ավելացնելու համար</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {toast && !pending && !open ? createPortal(
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
      <SignInSheet open={askSignIn} onClose={() => { setAskSignIn(false); writePending(null); }} reason="պահեք Ձեր նշումները և հարցերը" hint="Կարդալ կարելի է առանց մուտքի։ Մուտքից հետո ընտրված տողը կպահվի ինքնաբերաբար։" />
    </>
  );
}
