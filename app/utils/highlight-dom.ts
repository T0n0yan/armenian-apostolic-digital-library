/**
 * Էջի կարդալու տեքստը (.reading-body) մեկ տող-տեքստի տեսքով և հետ՝ DOM-ի կետերի։
 * Պարբերությունների և <br>-երի տեղում դրվում է «\n» (առանց DOM-ի հանգույցի), որ բառերը չկպչեն իրար։
 */
type Entry = { node: Text; start: number };
export type TextMap = { text: string; entries: Entry[] };

const BLOCKS = new Set(["P", "DIV", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "UL", "OL", "PRE", "FIGURE", "TR"]);
const SKIP = "button, input, textarea, select, script, style, svg, [aria-hidden='true'], [data-highlight-skip]";

/** Նյութի էջի այն մասը, որտեղ կարելի է նշել (`data-highlight-material`-ով article)։ */
export function highlightRoot() {
  return document.querySelector<HTMLElement>("[data-highlight-material]");
}

export function readingBodies(root: Element) {
  return [...root.querySelectorAll<HTMLElement>(".reading-body")].filter((body) => !body.parentElement?.closest(".reading-body"));
}

export function buildTextMap(bodies: Element[]): TextMap {
  let text = "";
  const entries: Entry[] = [];
  // «\n»՝ պարզ տող/պարբերություն, «\u2029»՝ կոշտ սահման (նախադասությունը չի անցնում դրա վրայով)։
  const breakLine = (hard = false) => {
    if (!text) return;
    if (hard) { text = text.replace(/\n$/u, ""); if (!text.endsWith("\u2029")) text += "\u2029"; }
    else if (!/[\n\u2029]$/u.test(text)) text += "\n";
  };
  let afterHeading = false;
  for (const body of bodies) {
    breakLine(true);
    afterHeading = false;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node instanceof Element && node.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text) {
        if (!node.data) continue;
        entries.push({ node, start: text.length });
        text += node.data;
      } else if (node instanceof Element && (node.tagName === "BR" || BLOCKS.has(node.tagName))) {
        // Վերնագրի առաջ և հետո՝ կոշտ սահման, որ վերնագիրը չկպչի նախադասությանը։
        const heading = /^H[1-6]$/u.test(node.tagName) || node.classList.contains("psalm-superscription");
        breakLine(heading || afterHeading);
        if (node.tagName !== "BR") afterHeading = heading;
      }
    }
  }
  return { text, entries };
}

/** DOM-ի կետը (ընտրության սկիզբ կամ վերջ) → դիրք տեքստում։ */
export function offsetOf(map: TextMap, container: Node, offset: number) {
  if (container instanceof Text) {
    const entry = map.entries.find((item) => item.node === container);
    if (entry) return entry.start + Math.min(offset, container.data.length);
  }
  const point = document.createRange();
  try { point.setStart(container, offset); } catch { return null; }
  // Առաջին տեքստը, որը սկսվում է այս կետից հետո։
  const next = map.entries.find((item) => point.comparePoint(item.node, 0) >= 0);
  return next ? next.start : map.text.length;
}

/** Դիրք տեքստում → DOM-ի կետ։ «\n»-ի (առանց հանգույցի) տեղում՝ հաջորդ տեքստի սկիզբը։ */
function pointAt(map: TextMap, offset: number, end: boolean) {
  let low = 0;
  let high = map.entries.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (map.entries[middle].start <= offset) low = middle; else high = middle - 1;
  }
  const entry = map.entries[low];
  if (!entry) return null;
  const inside = offset - entry.start;
  if (inside <= entry.node.data.length) {
    // Վերջի կետը տեքստի սկզբում՝ նախորդ տեքստի վերջն է (որ կողքի պարբերությունը չներկվի)։
    if (end && inside === 0 && low > 0) { const previous = map.entries[low - 1]; return { node: previous.node, offset: previous.node.data.length }; }
    return { node: entry.node, offset: inside };
  }
  const following = map.entries[low + 1];
  return following ? { node: following.node, offset: 0 } : { node: entry.node, offset: entry.node.data.length };
}

/**
 * Եթե կետը համարակալված տողում է (`data-verse`), վերադարձնում է ամբողջ համարի սահմանները տեքստում.
 * մեկ համարը կարող է լինել մի քանի տող՝ նույն `data-verse`-ով, իրար կողքի։ Այլապես՝ null։
 */
export function verseBoundsAt(map: TextMap, node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  const line = element?.closest<HTMLElement>("[data-verse]");
  const verse = line?.dataset.verse;
  if (!line || !verse) return null;
  let first = line;
  let last = line;
  while (first.previousElementSibling instanceof HTMLElement && first.previousElementSibling.dataset.verse === verse) first = first.previousElementSibling;
  while (last.nextElementSibling instanceof HTMLElement && last.nextElementSibling.dataset.verse === verse) last = last.nextElementSibling;
  const start = offsetOf(map, first, 0);
  const end = offsetOf(map, last, last.childNodes.length);
  return start === null || end === null || end <= start ? null : { start, end };
}

export function rangeFor(map: TextMap, start: number, end: number) {
  const from = pointAt(map, start, false);
  const to = pointAt(map, end, true);
  if (!from || !to) return null;
  const range = document.createRange();
  try { range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset); } catch { return null; }
  return range.collapsed ? null : range;
}

/** Ունի՞ արդյոք բրաուզերը CSS Highlight API (առանց դրա նշումները պահվում են, բայց չեն ներկվում)։ */
export function highlightRegistry() {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return null;
  return CSS.highlights;
}

/** Սեղմված կետը (x, y) ընկնու՞մ է այս տիրույթի տողերից մեկի վրա։ */
export function rangeHit(range: Range, x: number, y: number) {
  return [...range.getClientRects()].some((rect) => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 3 && y <= rect.bottom + 3);
}

/** Բառարանի բառը այս կետում է՞ (այդ դեպքում առաջնահերթը բառարանն է)։ */
export function glossaryHit(x: number, y: number) {
  const glossary = highlightRegistry()?.get("glossary");
  if (!glossary) return false;
  for (const range of glossary) if (range instanceof Range && rangeHit(range, x, y)) return true;
  return false;
}
