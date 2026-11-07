// Story-ի նկարը canvas-ի վրա (միայն բրաուզերում)։ Դասավորությունը՝ story-layout.ts։
// Երկու առանձին մաս՝ վերնագիր և տեքստի շրջանակ. ամեն մեկն ունի իր չափը, գույնը, տառատեսակը և
// տակի շերտը։ Շրջանակը ընթերցողը տեղափոխում և լայնացնում/նեղացնում է, վերնագիրը՝ տեղափոխում։
// apostolic.am-ի գոտին (ներքևում) միշտ ազատ է մնում։

import type { StoryBackground } from "./story-backgrounds";
import {
  LINE_HEIGHT, PARAGRAPH_GAP, STORY_HEIGHT, STORY_SCALE, STORY_WIDTH, planStory,
  type StoryAlign, type StoryPlan,
} from "./story-layout";

export type StoryFont = "book" | "serif";
export type StoryShade = 0 | 1 | 2;

export type PartStyle = {
  /** Չափը «պիքսելներով» (հեռախոսի էկրանի պես). նկարում՝ ×3։ */
  size: number;
  /** "auto"՝ ֆոնի հակառակ գույնը հենց այդ մասի տակ։ */
  color: "auto" | string;
  font: StoryFont;
  shade: StoryShade;
};

export type StoryStyle = {
  title: PartStyle & { show: boolean };
  text: PartStyle & { align: StoryAlign };
};

export const TEXT_SIZES = { min: 10, max: 24, start: 15 };
export const TITLE_SIZES = { min: 12, max: 32, start: 21 };

export const DEFAULT_STYLE: StoryStyle = {
  title: { show: true, size: TITLE_SIZES.start, color: "auto", font: "serif", shade: 0 },
  text: { size: TEXT_SIZES.start, color: "auto", font: "book", shade: 0, align: "center" },
};

export type Rect = { left: number; top: number; width: number; height: number };
/** Վերնագրի տեղը՝ նրա մեջտեղը (x) և վերևը (y)։ */
export type TitlePlace = { x: number; y: number };
export type StoryLayout = { frame: Rect; title: TitlePlace };

const FAMILY: Record<StoryFont, string> = {
  book: '"Arian Grqi", "Noto Serif Armenian", Georgia, serif',
  serif: '"Noto Serif Armenian", Georgia, serif',
};
const TITLE_WEIGHT: Record<StoryFont, number> = { book: 400, serif: 600 };
/** Ազատ գոտին. վերևում՝ story-ի կոճակները, ներքևում՝ apostolic.am-ը։ */
export const SAFE = { left: 36, right: STORY_WIDTH - 36, top: 110, bottom: 1715 };
export const FRAME_MIN = { width: 320, height: 180 };
const SHADE_PAD = 34;
const TITLE_GAP = 34;

export const textPixels = (style: StoryStyle) => style.text.size * STORY_SCALE;
export const titlePixels = (style: StoryStyle) => style.title.size * STORY_SCALE;
const titleBlock = (style: StoryStyle) => titlePixels(style) * 1.25 + 22;

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

/** Սկզբնական դասավորությունը՝ ձևավորման տարածքում. վերնագիրը վերևում, տակը՝ տեքստի շրջանակը։ */
export function defaultLayout(background: StoryBackground, style: StoryStyle): StoryLayout {
  const { box } = background.design;
  const reserve = style.title.show ? titleBlock(style) + TITLE_GAP : 0;
  return {
    title: { x: (box.left + box.right) / 2, y: box.top },
    frame: { left: box.left, top: box.top + reserve, width: box.right - box.left, height: box.bottom - box.top - reserve },
  };
}

/** Շրջանակը մնում է ազատ գոտում և չի փոքրանում նվազագույնից։ */
export function clampFrame(frame: Rect): Rect {
  const width = Math.min(Math.max(frame.width, FRAME_MIN.width), SAFE.right - SAFE.left);
  const height = Math.min(Math.max(frame.height, FRAME_MIN.height), SAFE.bottom - SAFE.top);
  const left = Math.min(Math.max(frame.left, SAFE.left), SAFE.right - width);
  const top = Math.min(Math.max(frame.top, SAFE.top), SAFE.bottom - height);
  return { left, top, width, height };
}

export function clampTitle(place: TitlePlace, width: number, style: StoryStyle): TitlePlace {
  const half = Math.min(width, SAFE.right - SAFE.left) / 2;
  return {
    x: Math.min(Math.max(place.x, SAFE.left + half), SAFE.right - half),
    y: Math.min(Math.max(place.y, SAFE.top), SAFE.bottom - titleBlock(style)),
  };
}

export function makeMeasure(context: CanvasRenderingContext2D, font: StoryFont) {
  return (value: string, size: number) => {
    context.font = `400 ${size}px ${FAMILY[font]}`;
    return context.measureText(value).width;
  };
}

const frameBox = (frame: Rect) => ({ left: frame.left, right: frame.left + frame.width, top: frame.top, bottom: frame.top + frame.height });

export function planFor(context: CanvasRenderingContext2D, text: string, style: StoryStyle, frame: Rect): StoryPlan {
  return planStory(text, textPixels(style), frameBox(frame), makeMeasure(context, style.text.font));
}

function titleWidth(context: CanvasRenderingContext2D, value: string, style: StoryStyle) {
  context.font = `${TITLE_WEIGHT[style.title.font]} ${titlePixels(style)}px ${FAMILY[style.title.font]}`;
  return Math.min(context.measureText(value).width, SAFE.right - SAFE.left);
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

function colorsFor(part: PartStyle, rect: Rect, brightness: Brightness | null, tone: StoryBackground["tone"], accent: boolean) {
  const under = brightnessIn(brightness, rect, tone === "dark" ? 40 : 220);
  if (part.color !== "auto") return part.color;
  if (under > 140) return accent ? "#6e1f2b" : "#24150d";
  return accent ? "#e8c57f" : "#f7ecd2";
}

function drawShade(context: CanvasRenderingContext2D, rect: Rect, shade: StoryShade, darkText: boolean) {
  if (!shade) return;
  const alpha = shade === 1 ? (darkText ? 0.5 : 0.32) : (darkText ? 0.76 : 0.58);
  context.fillStyle = darkText ? `rgba(255, 250, 240, ${alpha})` : `rgba(14, 8, 16, ${alpha})`;
  roundedRect(context, rect, 34);
  context.fill();
}

export type StoryHit = { frame: Rect; title: Rect | null };

/** Նկարում է մեկ էջը։ Վերադարձնում է վերնագրի և շրջանակի տեղերը (քաշելու համար)։ */
export function drawStoryPage(context: CanvasRenderingContext2D, options: {
  background: StoryBackground;
  image: HTMLImageElement | null;
  brightness: Brightness | null;
  style: StoryStyle;
  layout: StoryLayout;
  plan: StoryPlan;
  page: number;
  title: string;
  /** Խմբագրում՝ եզրագծեր և շրջանակի չափը փոխելու կետեր։ */
  outline?: "title" | "text" | null;
}): StoryHit {
  const { background, image, brightness, style, layout, plan, page, title, outline } = options;
  const frame = layout.frame;
  const size = plan.size;
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
    context.font = `400 44px ${FAMILY.serif}`;
    context.fillText("apostolic.am", STORY_WIDTH / 2, 1790);
  }
  context.textBaseline = "alphabetic";

  // Վերնագիր (և էջի համարը)
  let titleRect: Rect | null = null;
  const header = plan.pages.length > 1 ? `${title} · ${page + 1}/${plan.pages.length}` : title;
  if (style.title.show) {
    const pixels = titlePixels(style);
    const width = titleWidth(context, header, style);
    const place = clampTitle(layout.title, width, style);
    titleRect = { left: place.x - width / 2, top: place.y, width, height: titleBlock(style) };
    const color = colorsFor(style.title, titleRect, brightness, background.tone, true);
    drawShade(context, grow(titleRect, SHADE_PAD * 0.7), style.title.shade, luminance(color) < 128);
    context.fillStyle = color;
    context.textAlign = "center";
    context.font = `${TITLE_WEIGHT[style.title.font]} ${pixels}px ${FAMILY[style.title.font]}`;
    let shown = header;
    while (shown.length > 4 && context.measureText(shown).width > SAFE.right - SAFE.left) shown = `${shown.slice(0, -2)}…`;
    context.fillText(shown, place.x, place.y + pixels);
    context.globalAlpha = 0.75;
    context.fillRect(place.x - 50, place.y + pixels * 1.25 + 14, 100, 3);
    context.globalAlpha = 1;
  }

  // Տեքստ. շրջանակի մեջ, ուղղահայաց՝ մեջտեղում
  const height = plan.pages[page]?.height ?? 0;
  const top = frame.top + Math.max(0, (frame.height - height) / 2);
  const textArea = { left: frame.left, top, width: frame.width, height: Math.max(height, size) };
  const color = colorsFor(style.text, textArea, brightness, background.tone, false);
  const darkText = luminance(color) < 128;
  drawShade(context, grow(frame, SHADE_PAD), style.text.shade, darkText);
  if (!style.title.show && plan.pages.length > 1) {
    context.fillStyle = color;
    context.textAlign = "center";
    context.font = `600 34px ${FAMILY.serif}`;
    context.fillText(`${page + 1}/${plan.pages.length}`, frame.left + frame.width / 2, Math.max(SAFE.top + 34, frame.top - 20));
  }
  context.fillStyle = color;
  context.font = `400 ${size}px ${FAMILY[style.text.font]}`;
  context.textAlign = style.text.align === "center" ? "center" : "left";
  if (!darkText) {
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = style.text.shade ? 6 : 14;
  }
  const x = style.text.align === "center" ? frame.left + frame.width / 2 : frame.left;
  let y = top;
  lines.forEach((line, index) => {
    if (index > 0 && line.paragraphStart) y += size * PARAGRAPH_GAP;
    context.fillText(line.text, x, y + size * (LINE_HEIGHT / 2 + 0.33));
    y += size * LINE_HEIGHT;
  });
  context.shadowColor = "transparent";
  context.shadowBlur = 0;

  if (outline !== undefined) {
    const stroke = (rect: Rect, active: boolean) => {
      context.setLineDash(active ? [] : [14, 12]);
      context.lineWidth = active ? 5 : 3;
      context.strokeStyle = active ? "#e2c27e" : darkText ? "rgba(60, 30, 20, 0.45)" : "rgba(255, 245, 220, 0.55)";
      roundedRect(context, rect, 16);
      context.stroke();
    };
    if (titleRect) stroke(grow(titleRect, 14), outline === "title");
    stroke(frame, outline === "text");
    // Շրջանակի չափը փոխելու կետերը՝ կողքերին և անկյունում։
    if (outline === "text") {
      context.setLineDash([]);
      for (const [hx, hy] of frameHandles(frame)) {
        context.beginPath();
        context.arc(hx, hy, 22, 0, Math.PI * 2);
        context.fillStyle = "#e2c27e";
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = "#2a1708";
        context.stroke();
      }
    }
  }
  context.restore();
  return { frame, title: titleRect };
}

export type Handle = "left" | "right" | "bottom" | "top" | "corner";

/** Չափը փոխելու կետերը. ձախ, աջ, վերև, ներքև և ներքևի աջ անկյուն։ */
export function frameHandles(frame: Rect): Array<[number, number, Handle]> {
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  const middleY = frame.top + frame.height / 2;
  const middleX = frame.left + frame.width / 2;
  return [[frame.left, middleY, "left"], [right, middleY, "right"], [middleX, frame.top, "top"], [middleX, bottom, "bottom"], [right, bottom, "corner"]];
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
