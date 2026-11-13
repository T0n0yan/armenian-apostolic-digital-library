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

/** Առաջին սմայլիկը (հին նշումներում կարող էին լինել մի քանիսը)։ */
export function firstEmoji(value: string) {
  if (!value) return "";
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  return Segmenter ? ([...new Segmenter().segment(value)][0]?.segment ?? "") : [...value][0] ?? "";
}

/** Միայն մեկ սմայլիկ, առանց տառերի. դատարկը նշանակում է «առանց սմայլիկի»։ */
export function cleanEmoji(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return "";
  if (text.length > 16 || !/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣#*0-9])+$/u.test(text)) return null;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text)) return null;
  // Մեկ հատ (մի քանի սմայլիկը քանդում էր դասավորությունը)։
  if (firstEmoji(text) !== text) return null;
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

/**
 * Նախադասության վերջը. վերջակետ «։» (և նրա տեղը դրվող «:»), «!», «?», «…» կամ «\u2029»՝ վերնագրի,
 * սաղմոսի վերնագրի և առանձին տեքստերի սահմանը (`buildTextMap`)։ Միջակետը «.» և «՞»-ն վերջ չեն,
 * պարզ նոր տողն էլ չէ (սաղմոսի համարը կարող է երկու տող լինել)։
 */
const SENTENCE_END = /[։:!?…\u2029]/u;

/** Այն նախադասությունը, որի վրա սեղմել են (դիրք տեքստում) → { start, end }՝ վերջակետով, առանց համարի։ */
export function sentenceAt(text: string, offset: number) {
  if (offset < 0 || offset > text.length) return null;
  // Սեղմել են վերջակետի աջ կեսին կամ նրանից հետո բացատին. կուրսորը վերջակետից հետո է, բայց մարդը
  // նկատի ունի հենց այդ նախադասությունը (ոչ թե հաջորդը)։
  if (offset > 0 && /[։:!?…»"')\]]/u.test(text[offset - 1]) && (offset === text.length || /[\s\u2029]/u.test(text[offset]))) {
    offset -= 1;
    while (offset > 0 && /[»"')\]]/u.test(text[offset])) offset -= 1;
  }
  let start = offset;
  while (start > 0 && !SENTENCE_END.test(text[start - 1])) start -= 1;
  let end = offset;
  while (end < text.length && !SENTENCE_END.test(text[end])) end += 1;
  // Վերջակետը (և նրան կպած փակագիծ/չակերտ) նախադասության մասն է։
  while (end < text.length && /[։:!?…»"')\]]/u.test(text[end])) end += 1;
  while (start < end && /[\s»"')\]]/u.test(text[start])) start += 1;
  // Սաղմոսի համարը («3 », «3. ») տողի մաս չէ։
  const number = /^\d{1,3}[.)]?\s+/u.exec(text.slice(start, end));
  if (number) start += number[0].length;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  return end - start >= 2 ? { start, end } : null;
}

export type Span = { start: number; end: number };

/**
 * Համարակալված տեքստի (սաղմոս, Աստվածաշունչ) մեկ համարը՝ որպես նշելու միավոր։ Դրսի բացատները
 * և սկզբի համարը («3 », «3. ») դուրս են մնում։ Ոչ համարակալված տեքստը նշվում է նախադասությամբ։
 */
export function verseSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /[\s\u2029]/u.test(text[start])) start += 1;
  const number = /^\d{1,3}[.)]?\s+/u.exec(text.slice(start, end));
  if (number) start += number[0].length;
  while (end > start && /[\s\u2029]/u.test(text[end - 1])) end -= 1;
  return end - start >= 2 ? { start, end } : null;
}

/** Ընտրված նախադասությունների ցանկում. նորը ավելանում է, արդեն ընտրվածը՝ հանվում (ցանկացած տեղից, ցանկացած հերթով)։ */
export function toggleSentence(spans: Span[], sentence: Span) {
  const inside = spans.findIndex((span) => sentence.start < span.end && sentence.end > span.start);
  if (inside >= 0) return spans.filter((_, index) => index !== inside);
  return [...spans, sentence].sort((a, b) => a.start - b.start);
}

/** Պահելիս՝ իրար կպած նախադասությունները դառնում են մեկ նշում, մնացածը՝ առանձին։ */
export function mergeSpans(spans: Span[], text: string) {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && /^[\s\d.։:!?…,;«»"'()-]*$/u.test(text.slice(last.end, span.start)) && !text.slice(last.end, span.start).includes("\u2029")) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/**
 * Որոնման արդյունքում գտնված կտորը՝ նշելու համար. «…առաջ» + «գտնված» + «հետո…»։ Եթե գտնվածը
 * տեքստի խորքում է, սկիզբը կտրվում է (բառի սահմանով), որ գտնված բառը միշտ երևա։ Չգտնելու դեպքում՝ null։
 */
export function matchAround(text: string, query: string, lead = 40) {
  const needle = query.trim().toLocaleLowerCase("hy");
  if (needle.length < 2) return null;
  const lower = text.toLocaleLowerCase("hy");
  // Մեծատառ/փոքրատառ փոխելիս երկարությունը չպետք է փոխվի, այլապես դիրքերը չեն համընկնի։
  if (lower.length !== text.length) return null;
  const at = lower.indexOf(needle);
  if (at < 0) return null;
  let from = 0;
  if (at > lead) {
    const space = text.indexOf(" ", at - lead);
    from = space >= 0 && space < at ? space + 1 : at - lead;
  }
  return { before: `${from ? "…" : ""}${text.slice(from, at)}`, match: text.slice(at, at + needle.length), after: text.slice(at + needle.length) };
}
