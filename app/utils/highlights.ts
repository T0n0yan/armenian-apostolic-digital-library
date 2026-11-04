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
  const quote = anchor.quote;
  if (!quote) return null;
  let best: { start: number; end: number; score: number } | null = null;
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const before = squash(text.slice(Math.max(0, at - CONTEXT_LENGTH * 2), at));
    const after = squash(text.slice(at + quote.length, at + quote.length + CONTEXT_LENGTH * 2));
    const score = commonSuffix(before, squash(anchor.prefix)) + commonPrefix(after, squash(anchor.suffix));
    if (!best || score > best.score) best = { start: at, end: at + quote.length, score };
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
