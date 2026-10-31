import { BookOpenText, MapPin, User, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { buildGlossaryIndex, findGlossaryWords, type GlossaryTerm } from "../utils/glossary";

/**
 * Բառարանը կայքի բոլոր տեքստերում (.reading-body)։
 * Բառերը նշվում են բրաուզերի կողմից (CSS Highlight API)՝ ոսկեգույն կետագծով, առանց տեքստին դիպչելու,
 * այնպես որ էջը չի վերանկարվում։ Բառի վրա սեղմելիս բացվում է փոքրիկ պատուհան՝ բացատրությամբ։
 */

// Բառարանը բեռնվում է մեկ անգամ ամբողջ այցի համար։
let loading: Promise<{ terms: GlossaryTerm[]; index: ReturnType<typeof buildGlossaryIndex> } | null> | null = null;
function loadGlossary() {
  loading ??= fetch("/api/glossary")
    .then((response) => (response.ok ? response.json() as Promise<{ terms: GlossaryTerm[] }> : null))
    .then((data) => (data?.terms.length ? { terms: data.terms, index: buildGlossaryIndex(data.terms) } : null))
    .catch(() => { loading = null; return null; });
  return loading;
}

type Mark = { range: Range; termId: number };
type Open = { term: GlossaryTerm; rect: DOMRect; range: Range };

const registry = () => (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
const HighlightClass = () => (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

export function GlossaryLayer() {
  const location = useLocation();
  const marks = useRef<Mark[]>([]);
  const terms = useRef(new Map<number, GlossaryTerm>());
  const [open, setOpen] = useState<Open | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Էջի տեքստերում գտնում է բառերը և նշում դրանք։ Կրկնվում է, երբ տեքստը փոխվում է։
  useEffect(() => {
    const highlights = registry();
    const Highlight = HighlightClass();
    if (!highlights || !Highlight) return;
    let cancelled = false;
    let timer: number | undefined;
    const scan = async () => {
      const roots = [...document.querySelectorAll(".reading-body")];
      if (!roots.length) { marks.current = []; highlights.delete("glossary"); return; }
      const glossary = await loadGlossary();
      if (!glossary || cancelled) return;
      terms.current = new Map(glossary.terms.map((term) => [term.id, term]));
      const found: Mark[] = [];
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const word of findGlossaryWords((node as Text).data, glossary.index)) {
            const range = document.createRange();
            range.setStart(node, word.start);
            range.setEnd(node, word.end);
            found.push({ range, termId: word.termId });
          }
        }
      }
      marks.current = found;
      if (found.length) highlights.set("glossary", new Highlight(...found.map((mark) => mark.range)));
      else highlights.delete("glossary");
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void scan(), 250); };
    later();
    // Տեքստը կարող է փոխվել (սաղմոսի տեսքը, նոր բեռնված մաս)՝ նորից ենք նշում։
    const observer = new MutationObserver(later);
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => { cancelled = true; window.clearTimeout(timer); observer.disconnect(); highlights.delete("glossary"); marks.current = []; setOpen(null); };
  }, [location.pathname]);

  // Բառի վրա սեղմելը. բացում է պատուհանը (և չի բացում սաղմոսի համարի պատուհանը)։
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!marks.current.length || window.getSelection()?.toString().trim()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".reading-body") || target.closest("a, button, input, textarea")) return;
      const { clientX: x, clientY: y } = event;
      const hit = marks.current.find((mark) => [...mark.range.getClientRects()].some((rect) => x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 4 && y <= rect.bottom + 4));
      const term = hit ? terms.current.get(hit.termId) : undefined;
      if (!hit || !term) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen({ term, rect: hit.range.getBoundingClientRect(), range: hit.range });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Բաց բառը մի քիչ ավելի պայծառ է, քանի դեռ պատուհանը բաց է։
  useEffect(() => {
    const highlights = registry();
    const Highlight = HighlightClass();
    if (!highlights || !Highlight) return;
    if (open) highlights.set("glossary-open", new Highlight(open.range));
    else highlights.delete("glossary-open");
  }, [open]);

  // Փակվում է դրսում սեղմելիս, Escape-ով, էջը թերթելիս կամ չափը փոխելիս։
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest("[data-glossary-card]"))) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown);
      window.addEventListener("scroll", close, { passive: true, once: true });
    }, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [close, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(<GlossaryCard open={open} onClose={close} />, document.body);
}

/** Բացատրության պատուհանը՝ բառի վերևում (կամ ներքևում, եթե վերևում տեղ չկա), սլաքով դեպի բառը։ */
function GlossaryCard({ open, onClose }: { open: Open; onClose: () => void }) {
  const { term, rect } = open;
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
  const above = rect.top > 230;
  const arrow = Math.min(Math.max(rect.left + rect.width / 2 - left, 22), width - 22);
  return (
    <div data-glossary-card role="dialog" aria-label={`«${term.word}» բառի բացատրությունը`}
      className="glossary-card fixed z-[2050]" style={{ left, width, ...(above ? { bottom: window.innerHeight - rect.top + 12 } : { top: rect.bottom + 12 }) }} data-side={above ? "above" : "below"}>
      <div className="relative overflow-hidden rounded-[22px] border border-[rgb(217_181_111/55%)] bg-[var(--page-bg)] shadow-[0_22px_50px_rgb(40_20_10/32%)]">
        {/* Ոսկեգույն լույս վերևի եզրին։ */}
        <div className="h-1 bg-[linear-gradient(90deg,transparent,#e2c27e,#b07d2e,#e2c27e,transparent)]" aria-hidden="true" />
        <div className="grid gap-2 px-4 pt-3 pb-4">
          <div className="flex items-center justify-between gap-2">
            {/* Պիտակը՝ ըստ բաժնի. բառ, անձնանուն կամ տեղանուն։ */}
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[1.4px] text-gold uppercase">
              {term.kind === "person" ? <User aria-hidden="true" size={13} /> : term.kind === "place" ? <MapPin aria-hidden="true" size={13} /> : <BookOpenText aria-hidden="true" size={13} />}
              {term.kind === "person" ? "Անձնանուն" : term.kind === "place" ? "Տեղանուն" : "Բառարան"}
            </span>
            <button className="-mr-1.5 grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-ink" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={15} /></button>
          </div>
          <strong className="font-noto text-[22px] leading-tight font-semibold text-gold-bright">{term.word}</strong>
          <div className="h-px bg-[linear-gradient(90deg,rgb(217_181_111/60%),transparent)]" aria-hidden="true" />
          <p className="m-0 text-[15px] leading-relaxed text-ink">{term.meaning}</p>
          {term.note ? <p className="m-0 text-[13px] leading-relaxed text-muted italic">{term.note}</p> : null}
          {!term.verified ? <span className="w-fit rounded-full bg-subtle px-2.5 py-0.5 text-[11px] text-faint">⚑ Ճշտել՝ սպասում է հոգևորականի ստուգմանը</span> : null}
        </div>
      </div>
      <span className="glossary-arrow absolute size-3.5 rotate-45 border-[rgb(217_181_111/55%)] bg-[var(--page-bg)]" style={{ left: arrow - 7, ...(above ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 } : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }) }} aria-hidden="true" />
    </div>
  );
}
