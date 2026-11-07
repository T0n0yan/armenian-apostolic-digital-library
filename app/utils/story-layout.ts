// Նկարով կիսվելու (story) դասավորությունը. տեքստը բաժանում է տողերի և էջերի։
// Մաքուր ֆունկցիաներ՝ canvas-ը փոխարինվում է `measure`-ով, որ թեստերը աշխատեն առանց բրաուզերի։

/** Story-ի չափը (Instagram, Facebook, Telegram). */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type StoryPosition = "top" | "center" | "bottom";
export type StoryAlign = "center" | "start";
export type StorySize = "auto" | "sm" | "md" | "lg" | "xl";

/** Տառի չափը պիքսելով (1080 լայնության վրա). */
export const STORY_SIZES: Record<Exclude<StorySize, "auto">, number> = { sm: 40, md: 48, lg: 58, xl: 70 };
const AUTO_MAX = 64;
const AUTO_MIN = 42;
/** «Ավտո»-ն երկար տեքստը բաժանում է էջերի այս չափով։ */
const AUTO_PAGED = 46;
/** Ավելի շատ էջ չենք առաջարկում. շատ երկար տեքստը նկարով չի կիսվում։ */
export const MAX_STORY_PAGES = 6;

export const LINE_HEIGHT = 1.5;
export const PARAGRAPH_GAP = 0.55;

export type Measure = (text: string, size: number) => number;

/** Տեքստի տարածքը նկարի վրա (պիքսելով). վերևը՝ ծրագրերի կոճակների, ներքևը՝ apostolic.am-ի համար։ */
export type StoryBox = { left: number; right: number; top: number; bottom: number };

export type StoryLine = { text: string; paragraphStart: boolean };
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
export function wrapParagraph(paragraph: string, width: number, size: number, measure: Measure) {
  const lines: string[] = [];
  let current = "";
  for (const word of paragraph.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size) <= width) { current = candidate; continue; }
    if (current) lines.push(current);
    if (measure(word, size) <= width) { current = word; continue; }
    // Բառը չի տեղավորվում մեկ տողում։
    let piece = "";
    for (const character of Array.from(word)) {
      if (piece && measure(piece + character, size) > width) { lines.push(piece); piece = ""; }
      piece += character;
    }
    current = piece;
  }
  if (current) lines.push(current);
  return lines;
}

function lineBlocks(paragraphs: string[], width: number, size: number, measure: Measure) {
  return paragraphs.map((paragraph) => wrapParagraph(paragraph, width, size, measure));
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
function fillPages(blocks: string[][], size: number, capacity: number) {
  const pages: StoryLine[][] = [[]];
  for (const block of blocks) {
    const lines = block.map((text, index) => ({ text, paragraphStart: index === 0 }));
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
function balancedPages(blocks: string[][], size: number, capacity: number) {
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

/**
 * Տեքստի պլանը. «Ավտո»-ն փնտրում է ամենամեծ չափը, որով ամեն ինչ տեղավորվում է մեկ նկարում.
 * չտեղավորվելու դեպքում՝ մի քանի նկար։
 */
export function planStory(text: string, choice: StorySize, box: StoryBox, measure: Measure): StoryPlan {
  const paragraphs = storyParagraphs(text);
  const width = box.right - box.left;
  const capacity = box.bottom - box.top;
  const build = (size: number) => {
    const pages = balancedPages(lineBlocks(paragraphs, width, size, measure), size, capacity)
      .map((lines) => ({ lines, height: blockHeight(lines, size) }));
    return { size, pages: pages.length ? pages : [{ lines: [], height: 0 }] };
  };
  let plan = choice === "auto" ? null : build(STORY_SIZES[choice]);
  if (!plan) {
    for (let size = AUTO_MAX; size >= AUTO_MIN && !plan; size -= 2) {
      const attempt = build(size);
      if (attempt.pages.length === 1) plan = attempt;
    }
    plan ??= build(AUTO_PAGED);
  }
  return { ...plan, tooLong: plan.pages.length > MAX_STORY_PAGES };
}

/** Տեքստի առաջին տողի վերևը՝ ըստ դիրքի։ */
export function blockTop(position: StoryPosition, box: StoryBox, height: number) {
  if (position === "top") return box.top;
  if (position === "bottom") return box.bottom - height;
  return box.top + (box.bottom - box.top - height) / 2;
}
