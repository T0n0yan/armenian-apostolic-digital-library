/**
 * Բառարան. տեքստում գտնում է բառարանի բառերը՝ իրենց ձևերով և վերջավորություններով։
 * Աշխատում է և՛ նոր, և՛ դասական ուղղագրությամբ («Տէր» = «Տեր», «տաւիղ» = «տավիղ»)։
 * Ապագայում նույնը կաշխատի Աստվածաշնչի համար. բառերը պարզապես կավելանան բազայում։
 */

export type GlossaryTerm = { id: number; word: string; forms: string[]; meaning: string; note: string; verified: boolean };

/** Բառը մեկ ձևի է բերում՝ փոքրատառ, «է»→«ե», «օ»→«ո», «իւ»→«յու», «ւ»→«վ» (բացի «ու»-ից)։ */
export function normalizeWord(word: string) {
  return word
    .toLocaleLowerCase("hy")
    .replace(/և/gu, "եւ")
    .replace(/ու/gu, "\u0001")
    .replace(/իւ/gu, "յ\u0001")
    .replace(/ւ/gu, "վ")
    .replace(/\u0001/gu, "ու")
    .replace(/է/gu, "ե")
    .replace(/օ/gu, "ո");
}

// Հոլովական և հոգնակի վերջավորություններ, որոնք կարող են գալ բառից հետո (արդեն մեկ ձևի բերված)։
const NOUN_ENDINGS = new Set([
  "", "ը", "ն", "ի", "ին", "ից", "ով", "ում", "ու", "ուն", "ուց", "ոց", "ս", "դ", "ք", "աց",
  "եր", "երը", "երն", "երի", "երին", "երից", "երով", "երում", "երս", "երդ",
  "ներ", "ները", "ներն", "ների", "ներին", "ներից", "ներով", "ներում", "ներս", "ներդ",
  "յի", "յին", "յից", "յով", "յում", "ու", "ուս", "ուդ",
]);
// Բայի վերջավորություններ՝ «փառաբան|ել» → «փառաբան|եցեք», «ծնրադր|ում»։
const VERB_ENDINGS = new Set([
  "ել", "ելու", "ելով", "ում", "ում են", "եմ", "ես", "ենք", "եք", "են", "եց", "եցի", "եցին", "եցեք", "եցեք", "իր", "իրք", "ի",
  "ալ", "ալու", "ալով", "ամ", "աս", "անք", "աք", "ան", "աց", "ացին", "ացեք", "ա", "եա", "յա",
]);
const MIN_STEM = 3;

type Entry = { termId: number; verb: boolean };

/** Բառարանից կազմում է արագ որոնման աղյուսակ. ձևը (մեկ ձևի բերված) → բառը։ */
export function buildGlossaryIndex(terms: GlossaryTerm[]) {
  const index = new Map<string, Entry>();
  for (const term of terms) {
    for (const form of [term.word, ...term.forms]) {
      const key = normalizeWord(form.trim());
      if (key.length < MIN_STEM) continue;
      if (!index.has(key)) index.set(key, { termId: term.id, verb: false });
      // «-ել», «-ալ» բայերի համար նաև արմատը («փառաբանել» → «փառաբան»)։
      const stem = /(ել|ալ)$/u.test(key) ? key.slice(0, -2) : "";
      if (stem.length >= MIN_STEM && !index.has(stem)) index.set(stem, { termId: term.id, verb: true });
    }
  }
  return index;
}

/** Բառը բառարանում է՞։ Վերադարձնում է բառի id-ն կամ null։ */
export function lookupWord(index: Map<string, Entry>, word: string): number | null {
  const key = normalizeWord(word);
  const found = lookupKey(index, key);
  // Դասական «յ» և «զ» նախդիրներ՝ «յերկինս» = «ի երկինս», «զօրհնութիւն»։
  if (found === null && /^[յզ]/u.test(key) && key.length > MIN_STEM + 1) return lookupKey(index, key.slice(1));
  return found;
}

function lookupKey(index: Map<string, Entry>, key: string) {
  for (let length = key.length; length >= MIN_STEM; length -= 1) {
    const entry = index.get(key.slice(0, length));
    if (!entry) continue;
    const ending = key.slice(length);
    if (NOUN_ENDINGS.has(ending) || (entry.verb && VERB_ENDINGS.has(ending))) return entry.termId;
  }
  return null;
}

/** Տեքստի բոլոր բառարանային բառերը՝ իրենց դիրքով։ */
export function findGlossaryWords(text: string, index: Map<string, Entry>) {
  const found: Array<{ start: number; end: number; termId: number }> = [];
  for (const match of text.matchAll(/\p{L}+/gu)) {
    const termId = lookupWord(index, match[0]);
    if (termId !== null) found.push({ start: match.index, end: match.index + match[0].length, termId });
  }
  return found;
}
