// Նկարով կիսվելու (story) դասավորությունը. տեքստը բաժանում է տողերի և էջերի։
// Մաքուր ֆունկցիաներ՝ canvas-ը փոխարինվում է `measure`-ով, որ թեստերը աշխատեն առանց բրաուզերի։

/** Story-ի չափը (Instagram, Facebook, Telegram). */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type StoryAlign = "center" | "start";
/**
 * Տառի չափը ընթերցողը ընտրում է «պիքսելներով»՝ ինչպես հեռախոսի էկրանին (story-ն ~360 px լայն է),
 * իսկ նկարում այն 3 անգամ մեծ է (1080 px)։
 */
export const STORY_SCALE = 3;

/** Ավելի շատ էջ չենք առաջարկում. շատ երկար տեքստը նկարով չի կիսվում։ */
export const MAX_STORY_PAGES = 6;

export const LINE_HEIGHT = 1.5;
export const PARAGRAPH_GAP = 0.55;

export type Measure = (text: string, size: number) => number;

/** Տեքստի տարածքը նկարի վրա (պիքսելով). վերևը՝ ծրագրերի կոճակների, ներքևը՝ apostolic.am-ի համար։ */
export type StoryBox = { left: number; right: number; top: number; bottom: number };

/** `indent`՝ զարդատառի կողքի տողերի ձախ նահանջը։ */
export type StoryLine = { text: string; paragraphStart: boolean; indent: number };
export type StoryPage = { lines: StoryLine[]; height: number };

/** Տեքստը պարբերությունների. դատարկ տողերը և ավելորդ բացատները հանվում են։ */
export function storyParagraphs(text: string) {
  return text
    .replace(/\r/gu, "")
    .split(/\n/u)
    .map((line) => line.replace(/[ \t ]+/gu, " ").trim())
    .filter(Boolean);
}

/** Մեկ պարբերությունը տողերի՝ ըստ լայնության. չափազանց երկար բառը կտրվում է տառերով։ */
export function wrapParagraph(paragraph: string, width: number | ((line: number) => number), size: number, measure: Measure) {
  const lines: string[] = [];
  const widthAt = () => (typeof width === "number" ? width : width(lines.length));
  let current = "";
  for (const word of paragraph.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size) <= widthAt()) { current = candidate; continue; }
    if (current) lines.push(current);
    if (measure(word, size) <= widthAt()) { current = word; continue; }
    // Բառը չի տեղավորվում մեկ տողում։
    let piece = "";
    for (const character of Array.from(word)) {
      if (piece && measure(piece + character, size) > widthAt()) { lines.push(piece); piece = ""; }
      piece += character;
    }
    current = piece;
  }
  if (current) lines.push(current);
  return lines;
}

/** Զարդատառը (թռչնագիր). առաջին պարբերության առաջին `lines` տողերը նեղանում են `width`-ով։ */
export type StoryCap = { width: number; lines: number };

function lineBlocks(paragraphs: string[], width: number, size: number, measure: Measure, cap?: StoryCap): StoryLine[][] {
  // Զարդատառի կողքի տողերը հաշվվում են ամբողջ տեքստով (կարճ առաջին պարբերությունից հետո՝ հաջորդում)։
  let before = 0;
  return paragraphs.map((paragraph) => {
    const start = before;
    const indentAt = (line: number) => (cap && start + line < cap.lines ? cap.width : 0);
    const lines = wrapParagraph(paragraph, (line) => width - indentAt(line), size, measure)
      .map((text, line) => ({ text, paragraphStart: line === 0, indent: indentAt(line) }));
    before += lines.length;
    return lines;
  });
}

/** Տողերի բարձրությունը. պարբերությունների միջև՝ փոքր բացատ։ */
export function blockHeight(lines: StoryLine[], size: number) {
  if (!lines.length) return 0;
  const gaps = lines.filter((line, index) => index > 0 && line.paragraphStart).length;
  return lines.length * size * LINE_HEIGHT + gaps * size * PARAGRAPH_GAP;
}

/**
 * Տողերը էջերի՝ `capacity` բարձրությամբ։ Պարբերությունը չի կտրվում, եթե էջն արդեն կիսով չափ լիքն
 * է և պարբերությունը ամբողջությամբ տեղավորվում է հաջորդ էջում։
 */
function fillPages(blocks: StoryLine[][], size: number, capacity: number) {
  const pages: StoryLine[][] = [[]];
  for (const block of blocks) {
    const lines = block;
    let page = pages[pages.length - 1];
    const whole = blockHeight(lines, size);
    if (page.length && blockHeight([...page, ...lines], size) > capacity && whole <= capacity && blockHeight(page, size) >= capacity * 0.5) {
      page = [];
      pages.push(page);
    }
    for (const line of lines) {
      if (page.length && blockHeight([...page, line], size) > capacity) {
        page = [];
        pages.push(page);
      }
      page.push(page.length ? line : { ...line, paragraphStart: true });
    }
  }
  return pages.filter((page) => page.length);
}

/**
 * Էջերը հավասարեցված. նույն քանակով էջ, բայց ամենափոքր բարձրությամբ, որ վերջին էջը մի տող չմնա։
 */
function balancedPages(blocks: StoryLine[][], size: number, capacity: number) {
  const first = fillPages(blocks, size, capacity);
  if (first.length < 2) return first;
  let low = size * LINE_HEIGHT;
  let high = capacity;
  let best = first;
  for (let step = 0; step < 18 && high - low > 1; step += 1) {
    const middle = (low + high) / 2;
    const attempt = fillPages(blocks, size, middle);
    if (attempt.length <= first.length) { best = attempt; high = middle; } else low = middle;
  }
  return best;
}

export type StoryPlan = { size: number; pages: StoryPage[]; tooLong: boolean };

/** Տեքստը տողերի և էջերի՝ տրված չափով և շրջանակով. չտեղավորվողը անցնում է հաջորդ նկար։ */
export function planStory(text: string, size: number, box: StoryBox, measure: Measure, cap?: StoryCap): StoryPlan {
  const blocks = lineBlocks(storyParagraphs(text), box.right - box.left, size, measure, cap);
  const capacity = Math.max(box.bottom - box.top, size * LINE_HEIGHT);
  const pages = balancedPages(blocks, size, capacity).map((lines) => ({ lines, height: blockHeight(lines, size) }));
  const list = pages.length ? pages : [{ lines: [], height: 0 }];
  return { size, pages: list, tooLong: list.length > MAX_STORY_PAGES };
}

/** Քանի հատված (սկզբից) է տեղավորվում մեկ նկարում. առնվազն մեկը։ */
export function fitCount(count: number, fits: (count: number) => boolean) {
  let low = 1;
  let high = count;
  if (fits(high)) return high;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle; else high = middle;
  }
  return low;
}

/**
 * Տեքստի հատվածները, որոնցից ընթերցողը ընտրում է, թե ինչ երևա նկարում. պարբերություններ (սաղմոսում՝
 * համարներ), իսկ երկար պարբերությունը՝ նախադասություններով։
 */
export function storyUnits(text: string, longParagraph = 260) {
  const units: Array<{ text: string; paragraphStart: boolean }> = [];
  for (const paragraph of storyParagraphs(text)) {
    if (Array.from(paragraph).length <= longParagraph) { units.push({ text: paragraph, paragraphStart: true }); continue; }
    const sentences = paragraph.match(/[^։:!?՞՜]+(?:[։:!?՞՜]+|$)\s*/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [paragraph];
    sentences.forEach((sentence, index) => units.push({ text: sentence, paragraphStart: index === 0 }));
  }
  return units;
}

/** Ընտրված հատվածները՝ տեքստ. նույն պարբերության նախադասությունները միանում են, բաց թողնվածի տեղում՝ «…»։ */
export function joinUnits(units: Array<{ text: string; paragraphStart: boolean }>, chosen: ReadonlySet<number>) {
  const lines: string[] = [];
  let previous = -1;
  units.forEach((unit, index) => {
    if (!chosen.has(index)) return;
    const gap = previous >= 0 && index > previous + 1;
    if (gap) lines.push("…");
    if (lines.length && !unit.paragraphStart && !gap) lines[lines.length - 1] += ` ${unit.text}`;
    else lines.push(unit.text);
    previous = index;
  });
  if (previous >= 0 && previous < units.length - 1) lines.push("…");
  return lines.join("\n");
}
