/**
 * Նշումներ տեքստում (պահված խոսք կամ հարց)՝ ընդհանուր տիպեր և մաքուր ֆունկցիաներ
 * (սերվերն ու բրաուզերը երկուսն էլ օգտագործում են)։
 */
export type HighlightKind = "mark" | "question";

export type Highlight = {
  id: string;
  materialId: string;
  kind: HighlightKind;
  quote: string;
  prefix: string;
  suffix: string;
  emoji: string;
  note: string;
  answer: string;
  answeredAt: string | null;
  section: string;
  title: string;
  path: string;
  createdAt: string;
  /** Սաղմոսի համարը, եթե նշվել է համարի պատուհանից։ */
  verse: number | null;
};

export const QUOTE_MAX = 1200;
export const CONTEXT_LENGTH = 32;
export const NOTE_MAX = 4000;
/** Մեկ մարդու նշումների առավելագույն թիվը (անվճար պլանի սահմաններում մնալու համար)։ */
export const HIGHLIGHTS_PER_USER = 2000;

/** Արագ ընտրության սմայլիկներ. մարդը կարող է դնել նաև ստեղնաշարի ցանկացածը։ */
export const QUICK_EMOJIS = ["🙏", "❤️", "✨", "💡", "🕊️", "🔥", "📖", "😢"];

/** Միայն սմայլիկ (1–3 հատ), առանց տառերի. դատարկը նշանակում է «առանց սմայլիկի»։ */
export function cleanEmoji(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return "";
  if (text.length > 16 || !/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣#*0-9])+$/u.test(text)) return null;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)) return null;
  return text;
}

/** Տեքստի բացատները մեկ ձևի (համեմատելու համար)։ */
function squash(value: string) {
  return value.replace(/\s+/g, " ");
}

function commonSuffix(a: string, b: string) {
  let count = 0;
  while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

function commonPrefix(a: string, b: string) {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

/**
 * Գտնում է պահված տողը էջի տեքստում։ Եթե տողը մի քանի անգամ է հանդիպում, ընտրում է այն տեղը,
 * որի շրջակա բառերը ամենաշատն են համընկնում պահվածի հետ։ Չգտնելու դեպքում՝ null
 * (տեքստը փոխվել է. նշումը մնում է «Նշումներ» էջում, ուղղակի տեքստում չի ներկվում)։
 */
export function findQuote(text: string, anchor: { quote: string; prefix: string; suffix: string }) {
  const quote = anchor.quote.trim();
  if (!quote) return null;
  // Բացատները ճկուն են. սաղմոսի համարի տողերը էջում «\n»-ով են, պահվածում՝ բացատով։
  const pattern = new RegExp(quote.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "gu");
  let best: { start: number; end: number; score: number } | null = null;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    const end = at + match[0].length;
    const before = squash(text.slice(Math.max(0, at - CONTEXT_LENGTH * 2), at));
    const after = squash(text.slice(end, end + CONTEXT_LENGTH * 2));
    const score = commonSuffix(before, squash(anchor.prefix)) + commonPrefix(after, squash(anchor.suffix));
    if (!best || score > best.score) best = { start: at, end, score };
  }
  return best ? { start: best.start, end: best.end } : null;
}

/** Ընտրված կտորը՝ առանց եզրերի բացատների, և նրա շրջակա բառերը։ */
export function anchorFor(text: string, start: number, end: number) {
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return {
    start,
    end,
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
  };
}

/** Պատճենելու տեքստը. «տող» — նյութի անունը և հղումը։ */
export function highlightCopyText(item: Pick<Highlight, "quote" | "title" | "path">, origin: string) {
  return `«${item.quote.replace(/\s*\n\s*/g, " ").trim()}»\n— ${item.title}\n${origin}${item.path}`;
}

/** Նախադասության վերջը. «։», «:», «.», «!», «?», «…» կամ նոր տող («՞»-ն բառի մեջ է, վերջ չէ)։ */
const SENTENCE_END = /[։:.!?…\n]/u;

/** Այն նախադասությունը, որի վրա սեղմել են (դիրք տեքստում) → { start, end }՝ վերջակետով։ */
export function sentenceAt(text: string, offset: number) {
  if (offset < 0 || offset > text.length) return null;
  let start = offset;
  while (start > 0 && !SENTENCE_END.test(text[start - 1])) start -= 1;
  let end = offset;
  while (end < text.length && !SENTENCE_END.test(text[end])) end += 1;
  // Վերջակետը (և նրան կպած փակագիծ/չակերտ) նախադասության մասն է, նոր տողը՝ ոչ։
  while (end < text.length && text[end] !== "\n" && /[։:.!?…»"')\]]/u.test(text[end])) end += 1;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return end - start >= 2 ? { start, end } : null;
}

/** Ընտրված տիրույթին ավելացնում է նախադասությունը. հարևանը միանում է, ներսինը՝ հանվում է, հեռուն փոխարինում է։ */
export function extendSelection(current: { start: number; end: number } | null, sentence: { start: number; end: number }, text: string) {
  if (!current) return sentence;
  if (sentence.start >= current.start && sentence.end <= current.end) {
    if (sentence.start === current.start && sentence.end === current.end) return null;
    if (sentence.start === current.start) return anchorFor(text, sentence.end, current.end);
    if (sentence.end === current.end) return anchorFor(text, current.start, sentence.start);
    return null;
  }
  const gap = sentence.start >= current.end ? text.slice(current.end, sentence.start) : sentence.end <= current.start ? text.slice(sentence.end, current.start) : "";
  if (/^[\s։:.!?…,;«»"'()-]*$/u.test(gap)) return { start: Math.min(current.start, sentence.start), end: Math.max(current.end, sentence.end) };
  return sentence;
}
