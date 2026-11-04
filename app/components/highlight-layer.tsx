import { Copy, HelpCircle, Highlighter, PencilLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useRouteLoaderData } from "react-router";

import { HighlightSheet, highlightRequest } from "./highlight-sheet";
import { SignInSheet } from "./sign-in-sheet";
import { anchorFor, findQuote, highlightCopyText, QUOTE_MAX, type Highlight, type HighlightKind } from "../utils/highlights";
import {
  buildTextMap, glossaryHit, highlightRegistry, highlightRoot, offsetOf, rangeFor, rangeHit, readingBodies,
} from "../utils/highlight-dom";

type Selected = { quote: string; prefix: string; suffix: string };
type Painted = { item: Highlight; range: Range };
const PENDING_KEY = "pending-highlight";

function readPending(): (Selected & { materialId: string; kind: HighlightKind }) | null {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null"); } catch { return null; }
}
function writePending(value: (Selected & { materialId: string; kind: HighlightKind }) | null) {
  try { if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); else sessionStorage.removeItem(PENDING_KEY); } catch { /* պահեստը փակ է */ }
}

/**
 * Նշումներ տեքստում (կայքի բոլոր նյութերում, `.reading-body`-ի մեջ)։
 * Տեքստ ընտրելիս ներքևում բացվում է վահանակ՝ «Պահել», «Հարց», «Պատճենել»։ Պահված տողերը ներկվում
 * են CSS Highlight API-ով (DOM-ը չի փոխվում, ուստի բառարանն ու սաղմոսի համարները չեն խանգարվում)։
 * Պահված տողի վրա սեղմելիս բացվում է նշման քարտը. բառարանի բառի վրա սեղմելը առաջնահերթ բառարանինն է։
 */
export function HighlightLayer() {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as { signedIn?: boolean } | undefined;
  const signedIn = Boolean(rootData?.signedIn);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [items, setItems] = useState<Highlight[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [open, setOpen] = useState<Highlight | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [toast, setToast] = useState<{ text: string; item?: Highlight } | null>(null);
  const [busy, setBusy] = useState(false);
  const painted = useRef<Painted[]>([]);
  const hideTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string, item?: Highlight) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, item });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  // Ո՞ր նյութի էջում ենք (article[data-highlight-material])։
  useEffect(() => {
    const find = () => setMaterialId(highlightRoot()?.dataset.highlightMaterial ?? null);
    find();
    const timer = window.setTimeout(find, 300);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  // Այս նյութի նշումները. մուտքից հետո պահում է նաև մուտքից առաջ ընտրված տողը։
  useEffect(() => {
    setItems([]); setSelected(null); setOpen(null);
    if (!materialId || !signedIn) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/highlights?materialId=${encodeURIComponent(materialId)}`).catch(() => null);
      const data = (await response?.json().catch(() => null)) as { highlights?: Highlight[] } | null;
      if (cancelled) return;
      setItems(data?.highlights ?? []);
      const pending = readPending();
      if (pending?.materialId === materialId) {
        writePending(null);
        const result = await highlightRequest({ action: "create", ...pending });
        if (cancelled || !result?.ok || !result.highlight) return;
        const created = result.highlight;
        setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
        if (created.kind === "question") setOpen(created); else showToast("Պահված է «Իմ նշումները»-ում", created);
      }
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

  // Տեքստի ընտրություն → վահանակ։
  useEffect(() => {
    if (!materialId) return;
    let timer: number | undefined;
    const read = () => {
      const selection = window.getSelection();
      const root = highlightRoot();
      const range = selection && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      const bodies = root ? readingBodies(root) : [];
      const inside = (node: Node) => bodies.some((body) => body.contains(node));
      if (!range || !inside(range.startContainer) || !inside(range.endContainer)) {
        // Մի փոքր ուշացումով, որ վահանակի կոճակին հասցնի սեղմել (հեռախոսում ընտրությունը նախ մաքրվում է)։
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setSelected(null), 450);
        return;
      }
      const map = buildTextMap(bodies);
      const start = offsetOf(map, range.startContainer, range.startOffset);
      const end = offsetOf(map, range.endContainer, range.endOffset);
      if (start === null || end === null || end - start < 2) { setSelected(null); return; }
      const anchor = anchorFor(map.text, start, end);
      window.clearTimeout(hideTimer.current);
      setSelected(anchor.quote.length >= 2 ? { quote: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix } : null);
    };
    const onChange = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 150); };
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); window.clearTimeout(timer); };
  }, [materialId]);

  // Պահված տողի վրա սեղմելը բացում է քարտը (բառարանի բառը և հղումները՝ ոչ)։
  useEffect(() => {
    if (!materialId) return;
    const onClick = (event: MouseEvent) => {
      if (!painted.current.length || window.getSelection()?.toString().trim()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".reading-body") || target.closest("a, button, input, textarea")) return;
      const { clientX: x, clientY: y } = event;
      if (glossaryHit(x, y)) return;
      const hit = painted.current.find((entry) => rangeHit(entry.range, x, y));
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(hit.item);
    };
    // Բառարանի պատուհանից «Բացել նշումը»։
    const onOpenAt = (event: Event) => {
      const range = (event as CustomEvent<Range>).detail;
      const hit = painted.current.find((entry) => entry.range.isPointInRange(range.startContainer, range.startOffset));
      if (hit) setOpen(hit.item);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("highlight-open-at", onOpenAt);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("highlight-open-at", onOpenAt); };
  }, [materialId]);

  const save = async (kind: HighlightKind) => {
    if (!selected || !materialId || busy) return;
    if (!signedIn) {
      writePending({ ...selected, materialId, kind });
      setAskSignIn(true);
      return;
    }
    setBusy(true);
    const result = await highlightRequest({ action: "create", materialId, kind, ...selected });
    setBusy(false);
    if (!result?.ok || !result.highlight) {
      showToast(result?.reason === "limit" ? "Նշումների թիվը հասել է սահմանին (2000)։ Ջնջեք հներից մի քանիսը։" : "Չհաջողվեց պահել. ստուգեք կապը։");
      return;
    }
    const created = result.highlight;
    window.getSelection()?.removeAllRanges();
    setSelected(null);
    setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    if (kind === "question") setOpen(created); else showToast("Պահված է «Իմ նշումները»-ում", created);
  };

  const copy = async () => {
    if (!selected) return;
    const root = highlightRoot();
    const text = highlightCopyText({ quote: selected.quote, title: root?.dataset.highlightTitle ?? "", path: root?.dataset.highlightPath ?? window.location.pathname }, window.location.origin);
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
    showToast(ok ? "Պատճենված է ✓" : "Չհաջողվեց պատճենել");
  };

  const tooLong = (selected?.quote.length ?? 0) > QUOTE_MAX;
  const tile = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border-0 px-3 text-[13.5px] font-bold disabled:cursor-default disabled:opacity-50";

  if (typeof document === "undefined") return null;
  return (
    <>
      {selected && !open ? createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tg-inset-bottom,0px)+16px)] z-[2040] flex justify-center px-3" data-highlight-skip>
          <div className="highlight-bar pointer-events-auto grid w-full max-w-[420px] gap-1.5 rounded-[20px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-2 shadow-[0_18px_44px_rgb(40_20_10/28%)] select-none" role="toolbar" aria-label="Նշել ընտրված տողը"
            onMouseDown={(event) => event.preventDefault()}>
            {tooLong ? <p className="m-0 text-center text-[12px] text-muted">Ընտրված կտորը շատ երկար է. ընտրեք ավելի կարճ (մինչև {QUOTE_MAX} նշան)։</p> : null}
            <div className="grid grid-cols-3 gap-1.5">
              <button className={`${tile} bg-[rgb(250_214_92/32%)] text-ink`} type="button" disabled={tooLong || busy} onClick={() => void save("mark")}><Highlighter aria-hidden="true" size={17} /> Պահել</button>
              <button className={`${tile} bg-[rgb(120_165_230/22%)] text-ink`} type="button" disabled={tooLong || busy} onClick={() => void save("question")}><HelpCircle aria-hidden="true" size={17} /> Հարց</button>
              <button className={`${tile} bg-subtle text-ink`} type="button" onClick={() => void copy()}><Copy aria-hidden="true" size={17} /> Պատճենել</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {toast && !selected && !open ? createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tg-inset-bottom,0px)+16px)] z-[2040] flex justify-center px-3" role="status">
          <div className="highlight-bar pointer-events-auto flex max-w-[420px] items-center gap-2 rounded-full border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] py-1.5 pr-1.5 pl-4 text-[13px] text-ink shadow-[0_14px_36px_rgb(40_20_10/24%)]">
            <span>{toast.text}</span>
            {toast.item ? (
              <button className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border-0 bg-[rgb(217_181_111/16%)] px-3 text-[12.5px] font-bold text-gold-bright" type="button"
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
