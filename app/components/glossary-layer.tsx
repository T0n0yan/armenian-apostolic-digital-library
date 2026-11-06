import { BookOpenText, MapPin, User, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { buildGlossaryIndex, findGlossaryWords, type GlossaryTerm } from "../utils/glossary";

/**
 * Բառարանը կայքի բոլոր տեքստերում (.reading-body)։
 * Ամեն բառից հետո դրվում է փոքրիկ աստղանիշ (*), ինչպես գրքերում ծանոթագրության նշանը։
 * Աստղանիշները առանձին շերտում են (տեքստի հանգույցներին չենք դիպչում), այնպես որ
 * պատճենելը, նշումները և որոնումը չեն փոխվում։ Բառի վրա սեղմելիս բացվում է փոքրիկ պատուհան՝ բացատրությամբ։
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

type Mark = { range: Range; termId: number; body: Element; tail: Range };

// Աստղանիշների շերտը՝ ամեն .reading-body-ի վերջում (aria-hidden, առանց տեքստի. աստղը CSS-ով է)։
const STARS = "data-glossary-stars";
const ours = (node: Node) => node instanceof Element && node.closest(`[${STARS}]`) !== null;

/** Միայն արտաքին .reading-body-ները (ներսինը արդեն մեջն է)։ */
function outerBodies() {
  return [...document.querySelectorAll(".reading-body")].filter((body) => !body.parentElement?.closest(".reading-body"));
}

/** Աստղը դրվում է բառից հետո, իսկ եթե բառին կպած է կետադրություն (՝ , ։ »), դրանից հետո։ */
function tailEnd(text: string, end: number) {
  let at = end;
  while (at < text.length && at - end < 3 && /[^\s\p{L}\p{N}]/u.test(text[at])) at += 1;
  return at;
}

/** Աստղերը դնում է իրենց տեղում։ Կանչվում է նաև, երբ տեքստի չափը կամ տառատեսակը փոխվում է։ */
function placeStars(marks: Mark[]) {
  const groups = new Map<Element, Mark[]>();
  for (const mark of marks) {
    const list = groups.get(mark.body);
    if (list) list.push(mark); else groups.set(mark.body, [mark]);
  }
  for (const layer of document.querySelectorAll(`[${STARS}]`)) if (!layer.parentElement || !groups.has(layer.parentElement)) layer.remove();
  for (const [body, list] of groups) {
    let layer = [...body.children].find((child) => child.hasAttribute(STARS)) as HTMLElement | undefined;
    const fresh = !layer;
    if (!layer) {
      layer = document.createElement("span");
      layer.setAttribute(STARS, "");
      layer.setAttribute("aria-hidden", "true");
      layer.setAttribute("data-highlight-skip", "");
    }
    while (layer.children.length < list.length) layer.appendChild(Object.assign(document.createElement("span"), { className: "glossary-star" }));
    while (layer.children.length > list.length) layer.lastElementChild?.remove();
    if (fresh) body.appendChild(layer);
    const box = body.getBoundingClientRect();
    list.forEach((mark, index) => {
      const star = layer.children[index] as HTMLElement;
      const rects = mark.tail.getClientRects();
      const rect = rects[rects.length - 1];
      star.hidden = !rect;
      if (!rect) return;
      star.style.left = `${rect.right - box.left - body.clientLeft}px`;
      // Տողի բարձրության 20%-ով ցածր՝ տառերի վերևի մակարդակում (ինչպես ծանոթագրության նշանը)։
      star.style.top = `${rect.top + rect.height * 0.2 - box.top - body.clientTop}px`;
    });
  }
}
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
    let cancelled = false;
    let timer: number | undefined;
    let frame = 0;
    const sizes = new ResizeObserver(() => reposition());
    function reposition() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => placeStars(marks.current));
    }
    const scan = async () => {
      const roots = outerBodies();
      if (!roots.length) { marks.current = []; placeStars([]); highlights?.delete("glossary"); return; }
      const glossary = await loadGlossary();
      if (!glossary || cancelled) return;
      terms.current = new Map(glossary.terms.map((term) => [term.id, term]));
      const found: Mark[] = [];
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node as Text).data;
          for (const word of findGlossaryWords(text, glossary.index)) {
            const range = document.createRange();
            range.setStart(node, word.start);
            range.setEnd(node, word.end);
            const tail = document.createRange();
            tail.setStart(node, word.start);
            tail.setEnd(node, tailEnd(text, word.end));
            found.push({ range, termId: word.termId, body: root, tail });
          }
        }
      }
      marks.current = found;
      placeStars(found);
      sizes.disconnect();
      for (const root of roots) sizes.observe(root);
      // «glossary» նշումը անտեսանելի է. պետք է highlight-layer-ին (glossaryHit), որ բառը առաջնահերթ լինի։
      if (!highlights || !Highlight) return;
      if (found.length) highlights.set("glossary", new Highlight(...found.map((mark) => mark.range)));
      else highlights.delete("glossary");
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void scan(), 250); };
    later();
    // Տեքստը կարող է փոխվել (սաղմոսի տեսքը, նոր բեռնված մաս)՝ նորից ենք նշում։ Մեր աստղերի փոփոխությունները չենք հաշվում։
    const observer = new MutationObserver((records) => {
      if (records.some((record) => {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return !ours(record.target) && (!nodes.length || !nodes.every(ours));
      })) later();
    });
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    document.fonts?.addEventListener("loadingdone", reposition);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      sizes.disconnect();
      document.fonts?.removeEventListener("loadingdone", reposition);
      highlights?.delete("glossary");
      marks.current = [];
      placeStars([]);
      setOpen(null);
    };
  }, [location.pathname]);

  // Բառի վրա սեղմելը. բացում է պատուհանը (և չի բացում սաղմոսի համարի պատուհանը)։
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!marks.current.length || window.getSelection()?.toString().trim()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".reading-body") || target.closest("a, button, input, textarea")) return;
      const { clientX: x, clientY: y } = event;
      // Աջից մի քիչ ավելի լայն, որ աստղի վրա սեղմելն էլ բացի։
      const hit = marks.current.find((mark) => [...mark.tail.getClientRects()].some((rect) => x >= rect.left - 3 && x <= rect.right + 10 && y >= rect.top - 4 && y <= rect.bottom + 4));
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

/** Բառը ընթերցողի պահված նշման (components/highlight-layer.tsx) մեջ է՞։ */
function inUserHighlight(range: Range) {
  const registry = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
  return ["user-mark", "user-question"].some((name) => {
    const highlight = registry?.get(name);
    if (!highlight) return false;
    for (const item of highlight) if (item instanceof Range && item.isPointInRange(range.startContainer, range.startOffset)) return true;
    return false;
  });
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
      {/* Սլաքը քարտի տակ է. քարտը ծածկում է նրա կեսը, և երևում է միայն բառին ուղղված եռանկյունին։ */}
      <span className="glossary-arrow absolute size-3.5 rotate-45 border-[rgb(217_181_111/55%)] bg-[var(--page-bg)]" style={{ left: arrow - 7, ...(above ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 } : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }) }} aria-hidden="true" />
      <div className="relative z-[1] overflow-hidden rounded-[22px] border border-[rgb(217_181_111/55%)] bg-[var(--page-bg)] shadow-[0_22px_50px_rgb(40_20_10/32%)]">
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
          {inUserHighlight(open.range) ? (
            <button className="w-fit cursor-pointer rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/12%)] px-3 py-1 text-[12px] font-bold text-gold-bright" type="button"
              onClick={() => { const range = open.range; onClose(); window.dispatchEvent(new CustomEvent("highlight-open-at", { detail: range })); }}>📌 Այս տողը պահված է՝ բացել նշումը</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
