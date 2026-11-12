import { foldOrthography, latinToArmenian, normalizeTelegramSearchText } from "./telegram-search";

/**
 * «Գուցե նկատի ունեիք…». որոնման բառը համեմատվում է գրադարանի վերնագրերի բառերի հետ։
 * Լատինատառը նախ դառնում է հայերեն (saxmos → սաղմոս), հետո ամենամոտ բառը գտնվում է
 * տառասխալներով հանդերձ (sermnacnai → սերմնացանի)։
 */
export type SearchVocabulary = { words: Map<string, number>; byLength: Map<number, string[]> };

const ARMENIAN_WORD = /^\p{Script=Armenian}{3,}$/u;

/** Բառարան՝ վերնագրերից և բաժինների անուններից (բառ → քանի անգամ է հանդիպում)։ */
export function buildSearchVocabulary(texts: string[]): SearchVocabulary {
  const words = new Map<string, number>();
  for (const text of texts) {
    for (const word of normalizeTelegramSearchText(text).split(" ")) {
      if (ARMENIAN_WORD.test(word)) words.set(word, (words.get(word) ?? 0) + 1);
    }
  }
  const byLength = new Map<number, string[]>();
  for (const word of words.keys()) {
    const length = Array.from(word).length;
    byLength.set(length, [...(byLength.get(length) ?? []), word]);
  }
  return { words, byLength };
}

/** Տառերի տարբերությունների թիվը (փոխարինում, ավելացում, ջնջում, կողք-կողքի տեղափոխում)։ */
export function editDistance(left: string, right: string, limit = Infinity) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previous2[j - 2] + 1);
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[b.length];
}

// Ե/է, ո/օ և նման ձայները համարվում են նույնը, որ տառասխալը «ավելի մոտ» լինի։
const looseLetters: Array<[string, string]> = [["է", "ե"], ["օ", "ո"], ["ը", ""], ["յ", "ի"], ["ց", "ծ"], ["ք", "կ"], ["թ", "տ"], ["փ", "պ"], ["ռ", "ր"], ["չ", "ճ"], ["ղ", "խ"]];
function loose(word: string) {
  let output = word;
  for (const [source, target] of looseLetters) output = output.replaceAll(source, target);
  return output;
}

function maxEdits(length: number) {
  return length <= 3 ? 0 : length <= 5 ? 1 : length <= 8 ? 2 : 3;
}

/** Լատինատառ բառի հնարավոր հայերեն ընթերցումները։ */
function armenianReadings(token: string) {
  if (!/\p{Script=Latin}/u.test(token)) return [token];
  const readings = new Set([foldOrthography(latinToArmenian(token))]);
  // Բառի սկզբի vo/ye-ն՝ Ո/Ե (voxormi → ողորմի)։
  const spoken = token.replace(/^vo/u, "o").replace(/^ye/u, "e");
  if (spoken !== token) readings.add(foldOrthography(latinToArmenian(spoken)));
  return [...readings].filter((reading) => /\p{Script=Armenian}/u.test(reading));
}

type Candidate = { word: string; score: number; count: number };

function nearestWords(reading: string, vocabulary: SearchVocabulary, take: number) {
  const length = Array.from(reading).length;
  const limit = maxEdits(length);
  const target = loose(reading);
  const candidates: Candidate[] = [];
  for (let size = length - limit; size <= length + limit; size += 1) {
    for (const word of vocabulary.byLength.get(size) ?? []) {
      const distance = Math.min(editDistance(reading, word, limit), editDistance(target, loose(word), limit) + 0.5);
      if (distance <= limit) candidates.push({ word, score: distance, count: vocabulary.words.get(word) ?? 0 });
    }
  }
  // Բառի սկիզբը (serm → սերմնացանի)՝ ավելի մոտ, քան մեկ տառի սխալը։
  if (length >= 4) {
    for (const [word, count] of vocabulary.words) {
      if (word !== reading && word.startsWith(reading)) candidates.push({ word, score: 0.9, count });
    }
  }
  candidates.sort((left, right) => left.score - right.score || right.count - left.count);
  const seen = new Set<string>();
  return candidates.filter((item) => !seen.has(item.word) && seen.add(item.word)).slice(0, take);
}

export type SearchCorrection = {
  /** Ուղղված որոնում (null՝ եթե ուղղելու բան չկա)։ */
  corrected: string | null;
  /** Մոտ բառեր՝ սեղմելու համար (միայն մեկ բառով որոնման դեպքում)։ */
  similar: string[];
  /** Հարցումը լատինատառ էր։ */
  latin: boolean;
};

export function correctSearchQuery(query: string, vocabulary: SearchVocabulary): SearchCorrection {
  const normalized = normalizeTelegramSearchText(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const latin = /\p{Script=Latin}/u.test(normalized);
  if (!tokens.length || tokens.length > 6) return { corrected: null, similar: [], latin };
  // Ուղղում ենք միայն եթե ամեն բառ գտնվեց բառարանում. մնացածը թողնում ենք սովորական որոնմանը։
  let confident = true;
  const corrected = tokens.map((token) => {
    if (/^\d+$/u.test(token)) return token;
    const readings = armenianReadings(token);
    const known = readings.find((reading) => vocabulary.words.has(reading));
    if (known) return known;
    for (const reading of readings) {
      const best = nearestWords(reading, vocabulary, 1)[0];
      if (best && best.score < 1.5) return best.word;
    }
    confident = false;
    return readings[0] ?? token;
  });
  const joined = corrected.join(" ");
  const similar = tokens.length === 1 && !/^\d+$/u.test(tokens[0])
    ? [...new Set(armenianReadings(tokens[0]).flatMap((reading) => nearestWords(reading, vocabulary, 5).map((item) => item.word)))]
      .filter((word) => word !== joined).slice(0, 4)
    : [];
  return { corrected: confident && joined && joined !== normalized && /\p{Script=Armenian}/u.test(joined) ? joined : null, similar, latin };
}
