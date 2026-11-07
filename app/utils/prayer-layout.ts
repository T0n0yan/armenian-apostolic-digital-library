/**
 * Աղոթքի ձևավորումը (գլխավոր ադմինի խմբագիրը)։ Պահվում է `material_layouts`-ում՝ Telegram-ի
 * տեքստից առանձին, այնպես որ սինքը այն չի ջնջում։ Այստեղ միայն մաքուր ֆունկցիաներ են
 * (սերվեր, բրաուզեր, թեստեր)։
 */
import type { BridgeFormattedText, BridgeRichBlock, BridgeRichContent, BridgeRichInline } from "../../shared/telegram-bridge-contract";
import { leadingTitleLength, richContentStartsWithTitle, skipPsalmLabel } from "./material-title";

export type LayoutColor = "gold" | "red";
export type LayoutCharSize = "sm" | "lg" | "xl";
/** Մեկ տառի ձևը. դատարկ օբյեկտը՝ սովորական։ */
export type CharStyle = { b?: true; i?: true; c?: LayoutColor; s?: LayoutCharSize };
/** Տառերի հատված [from, to) մեկ ձևով։ */
export type LayoutSpan = CharStyle & { from: number; to: number };
export type LayoutAlign = "start" | "center" | "end" | "justify";
export type LayoutSize = "sm" | "md" | "lg" | "xl";
/** text՝ աղոթքի տեքստ, note՝ նկարագրություն (մանր, շեղ, առանց թռչնատառի), title՝ պիտակ/ենթավերնագիր։ */
export type LayoutKind = "text" | "note" | "title";

export type LayoutParagraph = {
  text: string;
  kind: LayoutKind;
  align: LayoutAlign;
  size: LayoutSize;
  initial: boolean;
  bold: boolean;
  italic: boolean;
  spans: LayoutSpan[];
};

export type PrayerLayout = { v: 1; paragraphs: LayoutParagraph[] };

export const LAYOUT_LIMITS = { paragraphs: 400, text: 8_000, spans: 600, json: 300_000 } as const;

const aligns: LayoutAlign[] = ["start", "center", "end", "justify"];
const sizes: LayoutSize[] = ["sm", "md", "lg", "xl"];
const kinds: LayoutKind[] = ["text", "note", "title"];

export const PARAGRAPH_SCALE: Record<LayoutSize, number> = { sm: 0.88, md: 1, lg: 1.16, xl: 1.36 };
export const CHAR_SCALE: Record<LayoutCharSize, number> = { sm: 0.82, lg: 1.22, xl: 1.5 };

export function newParagraph(text = "", patch: Partial<LayoutParagraph> = {}): LayoutParagraph {
  return { text, kind: "text", align: "start", size: "md", initial: false, bold: false, italic: false, spans: [], ...patch };
}

// ---------- Տառ առ տառ ձևեր ----------

const sameStyle = (left: CharStyle, right: CharStyle) => left.b === right.b && left.i === right.i && left.c === right.c && left.s === right.s;
const isPlain = (style: CharStyle) => !style.b && !style.i && !style.c && !style.s;

function cleanStyle(style: CharStyle): CharStyle {
  const result: CharStyle = {};
  if (style.b) result.b = true;
  if (style.i) result.i = true;
  if (style.c) result.c = style.c;
  if (style.s) result.s = style.s;
  return result;
}

/** Հատվածները՝ ամեն տառի ձևի ցանկ։ */
export function expandStyles(length: number, spans: LayoutSpan[]): CharStyle[] {
  const styles: CharStyle[] = Array.from({ length }, () => ({}));
  for (const span of spans) {
    for (let index = Math.max(0, span.from); index < Math.min(length, span.to); index += 1) {
      styles[index] = cleanStyle({ ...styles[index], ...cleanStyle(span) });
    }
  }
  return styles;
}

/** Ամեն տառի ձևը՝ հետ կարճ հատվածների (հարևան նույն ձևերը միանում են)։ */
export function compressStyles(styles: CharStyle[]): LayoutSpan[] {
  const spans: LayoutSpan[] = [];
  let start = 0;
  for (let index = 1; index <= styles.length; index += 1) {
    if (index < styles.length && sameStyle(styles[index], styles[start])) continue;
    if (!isPlain(styles[start])) spans.push({ ...cleanStyle(styles[start]), from: start, to: index });
    start = index;
  }
  return spans;
}

export type StyleCommand =
  | { type: "bold" } | { type: "italic" }
  | { type: "color"; color: LayoutColor }
  | { type: "size"; size: LayoutCharSize }
  | { type: "clear" };

/**
 * Ընտրված տառերին ձև տալը։ Թավ/շեղ/գույն/չափը փոխարկիչ են. եթե ամբողջ ընտրվածն արդեն
 * այդպիսին է՝ հանվում է, այլապես՝ դրվում բոլորին։
 */
export function applyStyle(paragraph: LayoutParagraph, from: number, to: number, command: StyleCommand): LayoutParagraph {
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(paragraph.text.length, Math.max(from, to));
  if (end <= start) return paragraph;
  const styles = expandStyles(paragraph.text.length, paragraph.spans);
  const range = styles.slice(start, end);
  const all = (test: (style: CharStyle) => boolean) => range.every(test);
  let change: (style: CharStyle) => CharStyle;
  if (command.type === "clear") change = () => ({});
  else if (command.type === "bold") { const off = all((style) => Boolean(style.b)); change = (style) => ({ ...style, b: off ? undefined : true }); }
  else if (command.type === "italic") { const off = all((style) => Boolean(style.i)); change = (style) => ({ ...style, i: off ? undefined : true }); }
  else if (command.type === "color") { const off = all((style) => style.c === command.color); change = (style) => ({ ...style, c: off ? undefined : command.color }); }
  else { const off = all((style) => style.s === command.size); change = (style) => ({ ...style, s: off ? undefined : command.size }); }
  for (let index = start; index < end; index += 1) styles[index] = cleanStyle(change(styles[index]));
  return { ...paragraph, spans: compressStyles(styles) };
}

/** Ընտրված տառերի ընդհանուր ձևը (կոճակները «միացված» ցույց տալու համար)։ */
export function rangeStyle(paragraph: LayoutParagraph, from: number, to: number) {
  const range = expandStyles(paragraph.text.length, paragraph.spans).slice(Math.max(0, from), Math.max(from, to));
  const every = (test: (style: CharStyle) => boolean) => range.length > 0 && range.every(test);
  return {
    bold: every((style) => Boolean(style.b)),
    italic: every((style) => Boolean(style.i)),
    color: (["gold", "red"] as const).find((color) => every((style) => style.c === color)) ?? null,
    size: (["sm", "lg", "xl"] as const).find((size) => every((style) => style.s === size)) ?? null,
  };
}

/**
 * Տեքստի ուղղում. ընդհանուր սկիզբը և վերջը պահում են իրենց ձևերը, նոր տառերը ստանում են
 * իրենցից առաջ եկող տառի ձևը։
 */
export function editText(paragraph: LayoutParagraph, next: string): LayoutParagraph {
  const previous = paragraph.text;
  if (previous === next) return paragraph;
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  const styles = expandStyles(previous.length, paragraph.spans);
  const inherit = prefix > 0 ? styles[prefix - 1] : {};
  const inserted = Array.from({ length: next.length - prefix - suffix }, () => ({ ...inherit }));
  const result = [...styles.slice(0, prefix), ...inserted, ...styles.slice(previous.length - suffix)];
  return { ...paragraph, text: next, spans: compressStyles(result) };
}

/** Պարբերության մասը [from, to)՝ իր ձևերով։ */
function sliceParagraph(paragraph: LayoutParagraph, from: number, to: number): LayoutParagraph {
  const styles = expandStyles(paragraph.text.length, paragraph.spans).slice(from, to);
  return { ...paragraph, text: paragraph.text.slice(from, to), spans: compressStyles(styles) };
}

/** Դատարկ տողով բաժանված տեքստը դառնում է առանձին պարբերություններ (նույն ձևավորմամբ)։ */
export function splitOnBlankLines(paragraph: LayoutParagraph): LayoutParagraph[] {
  const pattern = /[ \t]*\n[ \t]*\n\s*/gu;
  const parts: LayoutParagraph[] = [];
  let last = 0;
  for (const match of paragraph.text.matchAll(pattern)) {
    const index = match.index ?? 0;
    parts.push(sliceParagraph(paragraph, last, index));
    last = index + match[0].length;
  }
  if (parts.length === 0) return [paragraph];
  parts.push(sliceParagraph(paragraph, last, paragraph.text.length));
  // Թռչնատառը մնում է միայն առաջինին, մնացածը ադմինն ինքը կմիացնի։
  return parts.filter((part) => part.text.trim()).map((part, index) => index === 0 ? part : { ...part, initial: false });
}

/** Երկու պարբերությունը մեկ (նոր տողով)։ Ձևավորումը՝ առաջինի։ */
export function mergeParagraphs(first: LayoutParagraph, second: LayoutParagraph): LayoutParagraph {
  const offset = first.text.length + 1;
  return {
    ...first,
    text: `${first.text}\n${second.text}`,
    spans: [...first.spans, ...second.spans.map((span) => ({ ...span, from: span.from + offset, to: span.to + offset }))],
  };
}

// ---------- Ցուցադրում ----------

/** Պարբերության առաջին տառը (թռչնատառի համար), -1՝ եթե չկա կամ անջատված է։ */
export function initialIndex(paragraph: LayoutParagraph) {
  if (!paragraph.initial || paragraph.kind !== "text") return -1;
  for (let index = 0; index < paragraph.text.length; index += 1) {
    if (/\p{L}/u.test(paragraph.text[index])) return index;
  }
  return -1;
}

export type LayoutSegment = { from: number; to: number; text: string; style: CharStyle; initial: boolean };

/** Պարբերությունը՝ նույն ձևով կտորների, թռչնատառը՝ առանձին կտոր։ */
export function paragraphSegments(paragraph: LayoutParagraph): LayoutSegment[] {
  const styles = expandStyles(paragraph.text.length, paragraph.spans);
  const initial = initialIndex(paragraph);
  const segments: LayoutSegment[] = [];
  let start = 0;
  for (let index = 1; index <= paragraph.text.length; index += 1) {
    const cut = index === paragraph.text.length || index === initial || index === initial + 1 || !sameStyle(styles[index], styles[start]);
    if (!cut) continue;
    segments.push({ from: start, to: index, text: paragraph.text.slice(start, index), style: styles[start], initial: start === initial });
    start = index;
  }
  return segments;
}

// ---------- Պահելուց առաջ ստուգում ----------

/** Բրաուզերից եկած ձևավորման ստուգում. սխալի դեպքում՝ null։ */
export function sanitizeLayout(value: unknown): PrayerLayout | null {
  if (!value || typeof value !== "object") return null;
  const paragraphs = (value as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0 || paragraphs.length > LAYOUT_LIMITS.paragraphs) return null;
  const result: LayoutParagraph[] = [];
  for (const raw of paragraphs) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.text !== "string" || item.text.length > LAYOUT_LIMITS.text) return null;
    const text = item.text.replace(/\r\n?/gu, "\n");
    if (!Array.isArray(item.spans) || item.spans.length > LAYOUT_LIMITS.spans) return null;
    const spans: LayoutSpan[] = [];
    for (const rawSpan of item.spans) {
      if (!rawSpan || typeof rawSpan !== "object") return null;
      const span = rawSpan as Record<string, unknown>;
      if (!Number.isInteger(span.from) || !Number.isInteger(span.to)) return null;
      const from = Math.max(0, span.from as number);
      const to = Math.min(text.length, span.to as number);
      if (to <= from) continue;
      spans.push({
        from, to,
        ...(span.b === true ? { b: true as const } : {}),
        ...(span.i === true ? { i: true as const } : {}),
        ...(span.c === "gold" || span.c === "red" ? { c: span.c } : {}),
        ...(span.s === "sm" || span.s === "lg" || span.s === "xl" ? { s: span.s } : {}),
      });
    }
    result.push({
      text,
      kind: kinds.includes(item.kind as LayoutKind) ? item.kind as LayoutKind : "text",
      align: aligns.includes(item.align as LayoutAlign) ? item.align as LayoutAlign : "start",
      size: sizes.includes(item.size as LayoutSize) ? item.size as LayoutSize : "md",
      initial: item.initial === true,
      bold: item.bold === true,
      italic: item.italic === true,
      // Համընկնող հատվածները՝ մեկ հստակ ցանկի։
      spans: compressStyles(expandStyles(text.length, spans)),
    });
  }
  return { v: 1, paragraphs: result };
}

export function parseStoredLayout(json: string | null | undefined): PrayerLayout | null {
  if (!json) return null;
  try { return sanitizeLayout(JSON.parse(json)); } catch { return null; }
}

// ---------- Telegram-ի տեքստից սկզբնական ձևավորում ----------

type SourceMaterial = {
  title: string;
  formattedText: BridgeFormattedText;
  formattedCaption: BridgeFormattedText;
  richContent: BridgeRichContent | null;
};

type Styled = { text: string; styles: CharStyle[] };

function styledFromInline(nodes: BridgeRichInline[], inherited: CharStyle, out: Styled) {
  for (const node of nodes) {
    if (node.type === "text") { out.text += node.text; for (let index = 0; index < node.text.length; index += 1) out.styles.push({ ...inherited }); }
    else if (node.type === "line-break") { out.text += "\n"; out.styles.push({}); }
    else if (node.type === "custom-emoji") { out.text += node.alt; for (let index = 0; index < node.alt.length; index += 1) out.styles.push({ ...inherited }); }
    else if (node.type === "unsupported") continue;
    else {
      const style = node.type === "bold" ? { ...inherited, b: true as const } : node.type === "italic" ? { ...inherited, i: true as const } : inherited;
      styledFromInline(node.children, style, out);
    }
  }
}

function styledFromBlocks(blocks: BridgeRichBlock[], out: Styled[]) {
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "pre") {
      const item: Styled = { text: "", styles: [] };
      styledFromInline(block.content, block.type === "heading" ? { b: true } : {}, item);
      out.push(item);
    } else if (block.type === "blockquote") styledFromBlocks(block.blocks, out);
    else if (block.type === "list") for (const entry of block.items) styledFromBlocks(entry, out);
    else if (block.type === "media" && block.caption.length) { const item: Styled = { text: "", styles: [] }; styledFromInline(block.caption, {}, item); out.push(item); }
  }
}

function styledFromFormatted(value: BridgeFormattedText, from: number): Styled {
  const styles: CharStyle[] = Array.from({ length: value.text.length }, () => ({}));
  for (const entity of value.entities) {
    if (entity.type !== "bold" && entity.type !== "italic") continue;
    for (let index = Math.max(0, entity.offset); index < Math.min(value.text.length, entity.offset + entity.length); index += 1) {
      styles[index] = entity.type === "bold" ? { ...styles[index], b: true } : { ...styles[index], i: true };
    }
  }
  return { text: value.text.slice(from), styles: styles.slice(from) };
}

/** Կտորը՝ դատարկ տողերով բաժանված պարբերությունների (եզրերի բացատները հանված)։ */
function toParagraphs(source: Styled): LayoutParagraph[] {
  const result: LayoutParagraph[] = [];
  const pattern = /\n[ \t]*\n\s*/gu;
  let last = 0;
  const push = (from: number, to: number) => {
    while (from < to && /\s/u.test(source.text[from])) from += 1;
    while (to > from && /\s/u.test(source.text[to - 1])) to -= 1;
    if (to <= from) return;
    result.push(newParagraph(source.text.slice(from, to), { spans: compressStyles(source.styles.slice(from, to)) }));
  };
  for (const match of source.text.matchAll(pattern)) { push(last, match.index ?? 0); last = (match.index ?? 0) + match[0].length; }
  push(last, source.text.length);
  return result;
}

/** Էջում այժմ ցույց տրվող տեքստը՝ պարբերություններով (խմբագրի սկզբնական վիճակը)։ */
export function sourceParagraphs(material: SourceMaterial): LayoutParagraph[] {
  let parts: Styled[];
  if (material.richContent) {
    const blocks = richContentStartsWithTitle(material.richContent, material.title) ? material.richContent.blocks.slice(1) : material.richContent.blocks;
    parts = [];
    styledFromBlocks(blocks, parts);
  } else if (material.formattedText.text) {
    const from = skipPsalmLabel(material.formattedText.text, leadingTitleLength(material.formattedText.text, material.title));
    parts = [styledFromFormatted(material.formattedText, from)];
  } else {
    parts = [styledFromFormatted(material.formattedCaption, leadingTitleLength(material.formattedCaption.text, material.title))];
  }
  return parts.flatMap(toParagraphs);
}

/** Նոր խմբագրի սկիզբը. թռչնատառը՝ առաջին պարբերությանը, ինչպես մինչ այժմ։ */
export function seedLayout(material: SourceMaterial): PrayerLayout {
  const paragraphs = sourceParagraphs(material);
  if (paragraphs[0]) paragraphs[0] = { ...paragraphs[0], initial: true };
  return { v: 1, paragraphs: paragraphs.length ? paragraphs : [newParagraph("", { initial: true })] };
}

/** Telegram-ի տեքստի նշանը (FNV-1a). փոխվելու դեպքում ադմինը զգուշացում է տեսնում։ */
export function sourceHash(material: SourceMaterial) {
  const text = sourceParagraphs(material).map((paragraph) => paragraph.text).join("\n\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}
