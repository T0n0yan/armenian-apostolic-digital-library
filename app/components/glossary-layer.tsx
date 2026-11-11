import { BookOpenText, MapPin, User, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { buildGlossaryIndex, findGlossaryWords, type GlossaryTerm } from "../utils/glossary";

/**
 * Բառարանը կայքի բոլոր տեքստերում (.reading-body)։
 * Բառը ոսկեգույն է, իսկ նրանից հետո փոքրիկ աստղանիշ (*) է, ինչպես գրքերում ծանոթագրության նշանը։
 * Աստղը դատարկ <span> է (նշանը CSS-ով), այնպես որ պատճենելիս չի անցնում, իսկ նշումները և որոնումը չեն փոխվում։ Բառի վրա սեղմելիս բացվում է փոքրիկ պատուհան՝ բացատրությամբ։
 */

type Glossary = { terms: GlossaryTerm[]; index: ReturnType<typeof buildGlossaryIndex> };

// Բառարանը պահվում է հեռախոսում (localStorage), որ էջը բացվելիս բառերը միանգամից նշվեն՝
// առանց ցանցին սպասելու։ Ցանցից թարմ տարբերակը բերվում է մեկ անգամ ամբողջ այցի համար։
const CACHE = "glossary-cache-v1";
let current: Glossary | null = null;
let refreshing: Promise<boolean> | null = null;

const makeGlossary = (terms: GlossaryTerm[]): Glossary => ({ terms, index: buildGlossaryIndex(terms) });

function cachedGlossary() {
  if (current) return current;
  try {
    const terms = JSON.parse(localStorage.getItem(CACHE) ?? "null") as GlossaryTerm[] | null;
    if (terms?.length) current = makeGlossary(terms);
  } catch { /* պահոցը փակ է կամ վնասված */ }
  return current;
}

/** Բերում է թարմ բառարանը։ true, եթե այն տարբերվում է արդեն օգտագործվողից։ */
function refreshGlossary() {
  refreshing ??= fetch("/api/glossary")
    .then((response) => (response.ok ? response.json() as Promise<{ terms: GlossaryTerm[] }> : null))
    .then((data) => {
      if (!data?.terms.length) return false;
      const raw = JSON.stringify(data.terms);
      let saved: string | null = null;
      try { saved = localStorage.getItem(CACHE); localStorage.setItem(CACHE, raw); } catch { /* առանց պահոցի էլ աշխատում է */ }
      if (current && saved === raw) return false;
      current = makeGlossary(data.terms);
      return true;
    })
    .catch(() => { refreshing = null; return false; });
  return refreshing;
}

type Mark = { range: Range; termId: number };

/**
 * Աստղը տեքստի մեջ է (փոքր դատարկ <span>, աստղը՝ CSS-ով), որ բառից հետո իրական տեղ զբաղեցնի։
 * Դրա համար տեքստի հանգույցը կիսում ենք և հիշում ամեն կիսումը։ Ամեն նոր որոնումից առաջ
 * և երբ React-ը փոխում է տեքստը, ամեն ինչ վերադարձնում ենք նախկին տեսքին (restoreStars)։
 */
type Split = { first: Text; rest: Text; star: HTMLElement; firstData: string };

const STAR = "data-glossary-star";
const ours = (node: Node) => node instanceof Element && node.hasAttribute(STAR);

/** Միայն արտաքին .reading-body-ները (ներսինը արդեն մեջն է)։ */
function outerBodies() {
  return [...document.querySelectorAll(".reading-body")].filter((body) => !body.parentElement?.closest(".reading-body"));
}

/** Աստղ է դնում node-ի `at` կետում։ */
function insertStar(node: Text, at: number, splits: Split[]) {
  if (!node.parentNode) return;
  const rest = node.splitText(at);
  const star = document.createElement("span");
  star.className = "glossary-star";
  star.setAttribute(STAR, "");
  star.setAttribute("aria-hidden", "true");
  star.setAttribute("data-highlight-skip", "");
  node.parentNode.insertBefore(star, rest);
  splits.push({ first: node, rest, star, firstData: node.data });
}

/** Հանում է աստղերը և միացնում կիսված տեքստը։ Եթե React-ը արդեն փոխել է տեքստը, մեր մնացած կտորը ավելորդ է՝ ջնջում ենք։ */
function restoreStars(splits: Split[]) {
  for (const split of splits.reverse()) {
    split.star.remove();
    if (!split.rest.parentNode) continue;
    // React-ի համար first-ը ամբողջ տեքստն է. եթե նա այն չի փոխել, մնացածը հետ ենք կպցնում։
    if (split.first.data === split.firstData) split.first.data += split.rest.data;
    split.rest.remove();
  }
  splits.length = 0;
}

/** Փոփոխությունը կարդալու տեքստի՞ մեջ է (կամ ավելացնում/հանում է այդպիսի տեքստ)։ Մեր աստղերը չեն հաշվվում։ */
function touchesReading(record: MutationRecord) {
  const nodes = [...record.addedNodes, ...record.removedNodes];
  if (nodes.length && nodes.every(ours)) return false;
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(".reading-body")) return true;
  return nodes.some((node) => node instanceof Element && (node.matches(".reading-body") || node.querySelector(".reading-body") !== null));
}

// Սերվերում useLayoutEffect չկա. այնտեղ պարզապես useEffect (որը չի աշխատում)։
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Open = { term: GlossaryTerm; rect: DOMRect; range: Range };

const registry = () => (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
const HighlightClass = () => (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

export function GlossaryLayer() {
  const location = useLocation();
  const marks = useRef<Mark[]>([]);
  const terms = useRef(new Map<number, GlossaryTerm>());
  const [open, setOpen] = useState<Open | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Էջի տեքստերում գտնում է բառերը և նշում դրանք։ useLayoutEffect՝ որ նշվի մինչև էջը նկարվելը։
  useIsomorphicLayoutEffect(() => {
    const highlights = registry();
    const Highlight = HighlightClass();
    let cancelled = false;
    const splits: Split[] = [];
    // Մեր սեփական փոփոխություններից հետո observer-ի հերթը մաքրում ենք, որ նորից չսկսի։
    const quiet = (change: () => void) => { change(); observer.takeRecords(); };
    const apply = () => {
      quiet(() => restoreStars(splits));
      const glossary = cachedGlossary();
      const roots = outerBodies();
      if (!roots.length || !glossary) { marks.current = []; highlights?.delete("glossary"); return; }
      terms.current = new Map(glossary.terms.map((term) => [term.id, term]));
      const found: Mark[] = [];
      const stars: Array<{ node: Text; at: number }> = [];
      // Ամեն բառ նշվում է միայն առաջին անգամ (ինչպես գրքում). նույն բառի այլ ձևերն էլ նույն termId-ն ունեն։
      const seen = new Set<number>();
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const word of findGlossaryWords((node as Text).data, glossary.index)) {
            if (seen.has(word.termId)) continue;
            seen.add(word.termId);
            const range = document.createRange();
            range.setStart(node, word.start);
            range.setEnd(node, word.end);
            found.push({ range, termId: word.termId });
            // Աստղը՝ անմիջապես բառից հետո, կետադրական նշանից առաջ («ժառանգութիւն*,»)։
            stars.push({ node: node as Text, at: word.end });
          }
        }
      }
      // Վերջից սկիզբ, որ նույն հանգույցի նախորդ կետերը չշարժվեն (Range-երը բրաուզերը ինքն է ուղղում)։
      quiet(() => { for (const star of stars.reverse()) insertStar(star.node, star.at, splits); });
      marks.current = found;
      // Բառը ոսկեգույն է («glossary» նշումը, app.css). պետք է նաև highlight-layer-ին (glossaryHit)։
      if (!highlights || !Highlight) return;
      if (found.length) highlights.set("glossary", new Highlight(...found.map((mark) => mark.range)));
      else highlights.delete("glossary");
    };
    // Միայն կարդալու տեքստի փոփոխությունները (ոչ թե, օրինակ, նվագարկչի ժամը)։ Նորից նշում ենք
    // անմիջապես՝ նույն պահին, մինչև էջը նկարվելը, այնպես որ բառը չի «թարթում»։
    const observer = new MutationObserver((records) => {
      if (records.some(touchesReading)) apply();
    });
    apply();
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    void refreshGlossary().then((changed) => { if (changed && !cancelled) apply(); });
    return () => {
      cancelled = true;
      observer.disconnect();
      restoreStars(splits);
      highlights?.delete("glossary");
      marks.current = [];
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
      const hit = marks.current.find((mark) => [...mark.range.getClientRects()].some((rect) => x >= rect.left - 3 && x <= rect.right + 10 && y >= rect.top - 4 && y <= rect.bottom + 4));
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
      <span className="glossary-arrow absolute size-3.5 rotate-45 border-[rgb(217_181_111/55%)] glass-arrow" style={{ left: arrow - 7, ...(above ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 } : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }) }} aria-hidden="true" />
      <div className="relative z-[1] overflow-hidden rounded-card border border-[rgb(217_181_111/55%)] liquid-sheet shadow-[0_22px_50px_rgb(40_20_10/32%)]">
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
