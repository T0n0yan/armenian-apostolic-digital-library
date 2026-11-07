// Story-ի նկարը canvas-ի վրա (միայն բրաուզերում)։ Դասավորությունը՝ story-layout.ts։
// Վերնագիրը և տեքստը երկու առանձին մաս են. ընթերցողը դրանք քաշում է մատով (offset), իսկ
// apostolic.am-ի գոտին (ներքևում) միշտ ազատ է մնում։

import type { StoryBackground } from "./story-backgrounds";
import {
  LINE_HEIGHT, PARAGRAPH_GAP, STORY_HEIGHT, STORY_WIDTH, planStory,
  type StoryAlign, type StoryPlan, type StorySize,
} from "./story-layout";

export type StoryFont = "book" | "serif";
export type StoryShade = 0 | 1 | 2;

/** Արագ ընտրության գույներ. բացի դրանից՝ ցանկացած գույն և «Ավտո»։ */
export const STORY_SWATCHES = ["#f7ecd2", "#ffffff", "#e8c57f", "#6e1f2b", "#24150d"];

export type StoryStyle = {
  size: StorySize;
  align: StoryAlign;
  /** "auto"՝ ֆոնի հակառակ գույնը (մուգ ֆոնին՝ բաց, բաց ֆոնին՝ մուգ)։ */
  color: "auto" | string;
  font: StoryFont;
  shade: StoryShade;
  showTitle: boolean;
};

export type Offset = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };

const FAMILY: Record<StoryFont, string> = {
  book: '"Arian Grqi", "Noto Serif Armenian", Georgia, serif',
  serif: '"Noto Serif Armenian", Georgia, serif',
};
const TITLE_FAMILY = '"Noto Serif Armenian", Georgia, serif';
/** Ազատ գոտին. վերևում՝ story-ի կոճակները, ներքևում՝ apostolic.am-ը։ */
export const SAFE = { left: 36, right: STORY_WIDTH - 36, top: 110, bottom: 1715 };
const SHADE_PAD = 44;
const TITLE_GAP = 34;

/** Վերնագիրը տեքստից մեծ է։ */
export function titleSize(textSize: number) {
  return Math.round(Math.min(78, Math.max(46, textSize * 1.18)));
}
function titleHeight(textSize: number) {
  return titleSize(textSize) * 1.25 + 22;
}

/** Տառատեսակները պետք է բեռնված լինեն, թե չէ canvas-ը կնկարի այլ տառերով։ */
export async function loadStoryFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = "Տէր Աստուած";
  await Promise.all([
    document.fonts.load(`400 48px "Arian Grqi"`, sample),
    document.fonts.load(`400 48px "Noto Serif Armenian"`, sample),
    document.fonts.load(`600 60px "Noto Serif Armenian"`, sample),
  ]).catch(() => undefined);
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

export function loadBackground(src: string) {
  let pending = images.get(src);
  if (!pending) {
    pending = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(src); resolve(null); };
      image.src = src;
    });
    images.set(src, pending);
  }
  return pending;
}

/** Ֆոնի պայծառությունը փոքր ցանցով (27×48)՝ «Ավտո» գույնի համար։ */
export type Brightness = { columns: number; rows: number; values: Float32Array };

export function measureBrightness(image: HTMLImageElement | null): Brightness | null {
  if (!image) return null;
  const columns = 27;
  const rows = 48;
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, columns, rows);
  const pixels = context.getImageData(0, 0, columns, rows).data;
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = 0.299 * pixels[index * 4] + 0.587 * pixels[index * 4 + 1] + 0.114 * pixels[index * 4 + 2];
  }
  return { columns, rows, values };
}

function brightnessIn(brightness: Brightness | null, rect: Rect, fallback: number) {
  if (!brightness) return fallback;
  const { columns, rows, values } = brightness;
  const x0 = Math.max(0, Math.floor((rect.left / STORY_WIDTH) * columns));
  const x1 = Math.min(columns - 1, Math.ceil(((rect.left + rect.width) / STORY_WIDTH) * columns));
  const y0 = Math.max(0, Math.floor((rect.top / STORY_HEIGHT) * rows));
  const y1 = Math.min(rows - 1, Math.ceil(((rect.top + rect.height) / STORY_HEIGHT) * rows));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { sum += values[y * columns + x]; count += 1; }
  return count ? sum / count : fallback;
}

function luminance(color: string) {
  const value = Number.parseInt(color.slice(1), 16);
  return 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
}

export function planFor(context: CanvasRenderingContext2D, text: string, style: StoryStyle, background: StoryBackground): StoryPlan {
  const { box } = background.design;
  return planStory(text, style.size, box, (value, size) => {
    context.font = `400 ${size}px ${FAMILY[style.font]}`;
    return context.measureText(value).width;
  }, (size) => (style.showTitle ? titleHeight(size) + TITLE_GAP : 0));
}

function clampRect(rect: Rect): Rect {
  const left = Math.min(Math.max(rect.left, SAFE.left), SAFE.right - rect.width);
  const top = Math.min(Math.max(rect.top, SAFE.top), SAFE.bottom - rect.height);
  return { ...rect, left, top };
}

/**
 * Վերնագրի և տեքստի տեղերը. սկզբում՝ ձևավորման տարածքի մեջտեղում, ապա՝ ընթերցողի քաշածով։
 * Երկուսն էլ մնում են ազատ գոտում (apostolic.am-ը չի ծածկվում)։
 */
export function storyRects(plan: StoryPlan, style: StoryStyle, background: StoryBackground, text: Offset, title: Offset) {
  const { box } = background.design;
  const width = box.right - box.left;
  const textHeight = Math.max(...plan.pages.map((page) => page.height), plan.size * LINE_HEIGHT);
  const titleBlock = style.showTitle ? titleHeight(plan.size) : 0;
  const total = textHeight + (style.showTitle ? titleBlock + TITLE_GAP : 0);
  const start = box.top + Math.max(0, (box.bottom - box.top - total) / 2);
  const textRect = clampRect({ left: box.left + text.x, top: start + (style.showTitle ? titleBlock + TITLE_GAP : 0) + text.y, width, height: textHeight });
  const titleRect = style.showTitle ? clampRect({ left: box.left + title.x, top: start + title.y, width, height: titleBlock }) : null;
  return { text: textRect, title: titleRect };
}

function roundedRect(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const { left: x, top: y, width, height } = rect;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function grow(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

/** Նկարում է մեկ էջը։ Վերադարձնում է վերնագրի և տեքստի տեղերը (քաշելու համար)։ */
export function drawStoryPage(context: CanvasRenderingContext2D, options: {
  background: StoryBackground;
  image: HTMLImageElement | null;
  brightness: Brightness | null;
  style: StoryStyle;
  plan: StoryPlan;
  page: number;
  title: string;
  textOffset: Offset;
  titleOffset: Offset;
  /** Խմբագրում՝ քաշվող մասերի բարակ եզրագիծը։ */
  outline?: boolean;
}) {
  const { background, image, brightness, style, plan, page, title } = options;
  const rects = storyRects(plan, style, background, options.textOffset, options.titleOffset);
  const { size } = plan;
  const lines = plan.pages[page]?.lines ?? [];
  context.save();
  context.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  if (image) {
    context.drawImage(image, 0, 0, STORY_WIDTH, STORY_HEIGHT);
  } else {
    // Նկարը չբեռնվեց. նույն տոնի պարզ ֆոն և apostolic.am-ը։
    context.fillStyle = background.tone === "dark" ? "#22142e" : "#ecdcb8";
    context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    context.textAlign = "center";
    context.fillStyle = background.tone === "dark" ? "#d9b56f" : "#7a5a2e";
    context.font = `400 44px ${TITLE_FAMILY}`;
    context.fillText("apostolic.am", STORY_WIDTH / 2, 1790);
  }

  // Գույն. «Ավտո»-ն նայում է ֆոնին հենց տեքստի տակ։
  const fallback = background.tone === "dark" ? 40 : 220;
  const under = brightnessIn(brightness, rects.text, fallback);
  const autoDark = under > 140;
  const color = style.color === "auto" ? (autoDark ? "#24150d" : "#f7ecd2") : style.color;
  const darkText = luminance(color) < 128;
  const titleUnder = rects.title ? brightnessIn(brightness, rects.title, fallback) : under;
  const titleColor = style.color === "auto" ? (titleUnder > 140 ? "#6e1f2b" : "#e8c57f") : color;

  if (style.shade) {
    const alpha = style.shade === 1 ? (darkText ? 0.5 : 0.32) : (darkText ? 0.74 : 0.55);
    context.fillStyle = darkText ? `rgba(255, 250, 240, ${alpha})` : `rgba(14, 8, 16, ${alpha})`;
    for (const rect of [rects.title, rects.text]) {
      if (!rect) continue;
      roundedRect(context, grow(rect, rect === rects.text ? SHADE_PAD : SHADE_PAD * 0.6), 36);
      context.fill();
    }
  }

  const anchorX = (rect: Rect) => (style.align === "center" ? rect.left + rect.width / 2 : rect.left);
  context.textAlign = style.align === "center" ? "center" : "left";
  context.textBaseline = "alphabetic";

  // Վերնագիր (և էջի համարը)
  if (rects.title) {
    const sizeOfTitle = titleSize(size);
    context.fillStyle = titleColor;
    context.font = `600 ${sizeOfTitle}px ${TITLE_FAMILY}`;
    const header = plan.pages.length > 1 ? `${title} · ${page + 1}/${plan.pages.length}` : title;
    let shown = header;
    while (shown.length > 4 && context.measureText(shown).width > rects.title.width) shown = `${shown.slice(0, -2)}…`;
    context.fillText(shown, anchorX(rects.title), rects.title.top + sizeOfTitle);
    context.globalAlpha = 0.75;
    const lineX = style.align === "center" ? rects.title.left + rects.title.width / 2 - 50 : rects.title.left;
    context.fillRect(lineX, rects.title.top + sizeOfTitle * 1.25 + 14, 100, 3);
    context.globalAlpha = 1;
  } else if (plan.pages.length > 1) {
    // Վերնագիր չկա, բայց էջի համարը պետք է։
    context.fillStyle = titleColor;
    context.font = `600 34px ${TITLE_FAMILY}`;
    context.fillText(`${page + 1}/${plan.pages.length}`, anchorX(rects.text), Math.max(SAFE.top + 34, rects.text.top - 24));
  }

  // Տեքստ
  context.fillStyle = color;
  context.font = `400 ${size}px ${FAMILY[style.font]}`;
  if (!darkText) {
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = style.shade ? 6 : 14;
  }
  let y = rects.text.top;
  lines.forEach((line, index) => {
    if (index > 0 && line.paragraphStart) y += size * PARAGRAPH_GAP;
    context.fillText(line.text, anchorX(rects.text), y + size * (LINE_HEIGHT / 2 + 0.33));
    y += size * LINE_HEIGHT;
  });
  context.shadowColor = "transparent";
  context.shadowBlur = 0;

  if (options.outline) {
    context.setLineDash([14, 12]);
    context.lineWidth = 3;
    context.strokeStyle = darkText ? "rgba(60, 30, 20, 0.45)" : "rgba(255, 245, 220, 0.55)";
    for (const rect of [rects.title, rects.text]) {
      if (!rect) continue;
      roundedRect(context, grow(rect, 18), 18);
      context.stroke();
    }
  }
  context.restore();
  return rects;
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
