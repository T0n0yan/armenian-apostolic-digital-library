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
/** Տառերի էֆեկտը. «gold»-ը ունի իր գույնը (ոսկու փայլ և կայծեր)։ */
export type StoryEffect = "none" | "shadow" | "glow" | "gold";

export type PartStyle = {
  /** Չափը «պիքսելներով» (հեռախոսի էկրանի պես). նկարում՝ ×3։ */
  size: number;
  /** "auto"՝ ֆոնի հակառակ գույնը հենց այդ մասի տակ։ */
  color: "auto" | string;
  font: StoryFont;
  /** Տակի շերտի ուժը՝ 0 (չկա) – 1 (խիտ)։ */
  shade: number;
  effect: StoryEffect;
};

export type StoryStyle = {
  title: PartStyle & { show: boolean };
  /** `ornate`՝ աղոթքի առաջին տառը թռչնագրով։ */
  text: PartStyle & { align: StoryAlign; ornate: boolean };
};

export const TEXT_SIZES = { min: 10, max: 24, start: 16 };
export const TITLE_SIZES = { min: 12, max: 32, start: 21 };

export const DEFAULT_STYLE: StoryStyle = {
  title: { show: true, size: TITLE_SIZES.start, color: "auto", font: "serif", shade: 0, effect: "gold" },
  text: { size: TEXT_SIZES.start, color: "auto", font: "book", shade: 0, effect: "glow", align: "center", ornate: true },
};

/** Պահված հին կարգավորումները (շերտը 0/1/2 էր)՝ նոր ձևի։ */
export function normalizeStyle(value: Partial<StoryStyle> | undefined): StoryStyle {
  const part = <T extends PartStyle>(base: T, saved: Partial<T> | undefined): T => {
    const merged = { ...base, ...saved };
    const shade = typeof merged.shade === "number" ? merged.shade : 0;
    return { ...merged, shade: shade > 1 ? shade / 2 : Math.max(0, shade) };
  };
  return { title: part(DEFAULT_STYLE.title, value?.title), text: part(DEFAULT_STYLE.text, value?.text) };
}

export type Rect = { left: number; top: number; width: number; height: number };
/** Վերնագրի տեղը՝ նրա մեջտեղը (x) և վերևը (y)։ */
export type TitlePlace = { x: number; y: number };
export type StoryLayout = { frame: Rect; title: TitlePlace };

const FAMILY: Record<StoryFont, string> = {
  book: '"Arian Grqi", "Noto Serif Armenian", Georgia, serif',
  serif: '"Noto Serif Armenian", Georgia, serif',
};
const TITLE_WEIGHT: Record<StoryFont, number> = { book: 400, serif: 600 };
const ORNATE_FAMILY = '"Trchnatar Birds Color", "Noto Serif Armenian", serif';
/** Զարդատառը զբաղեցնում է 2 տող։ */
const CAP_LINES = 2;
/** Ազատ գոտին. վերևում՝ story-ի կոճակները, ներքևում՝ apostolic.am-ը։ */
export const SAFE = { left: 36, right: STORY_WIDTH - 36, top: 110, bottom: 1715 };
export const FRAME_MIN = { width: 320, height: 180 };
const SHADE_PAD = 40;
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
    document.fonts.load(`400 120px "Trchnatar Birds Color"`, "ՓՏԱՄ"),
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

export type StoryInitial = { letter: string; size: number; width: number; ascent: number; left: number };
export type StoryPlanWithCap = StoryPlan & { initial: StoryInitial | null };

/** Աղոթքի առաջին տառը (եթե զարդատառը միացված է)՝ առանձնացված տեքստից։ */
function splitInitial(text: string) {
  const index = text.search(/\p{L}/u);
  if (index < 0 || /[\p{L}]/u.test(text.slice(0, index))) return null;
  return { letter: text[index], rest: text.slice(0, index) + text.slice(index + 1) };
}

export function planFor(context: CanvasRenderingContext2D, text: string, style: StoryStyle, frame: Rect, ornate = false): StoryPlanWithCap {
  const size = textPixels(style);
  const split = ornate && style.text.ornate ? splitInitial(text) : null;
  if (!split) return { ...planStory(text, size, frameBox(frame), makeMeasure(context, style.text.font)), initial: null };
  // Թռչնատառի պատկերը տառատեսակի մեջ փոքր է իր չափից. չափում ենք իրական բարձրությունը և
  // մեծացնում, որ զբաղեցնի ուղիղ CAP_LINES տող։
  context.font = `400 100px ${ORNATE_FAMILY}`;
  const probe = context.measureText(split.letter);
  const glyph = (probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent) || 60;
  const target = size * LINE_HEIGHT * CAP_LINES - size * 0.2;
  const capSize = Math.round((target / glyph) * 100);
  const scale = capSize / 100;
  const width = ((probe.actualBoundingBoxRight + probe.actualBoundingBoxLeft) || probe.width) * scale + size * 0.4;
  const plan = planStory(split.rest, size, frameBox(frame), makeMeasure(context, style.text.font), { width, lines: CAP_LINES });
  return { ...plan, initial: { letter: split.letter, size: capSize, width, ascent: probe.actualBoundingBoxAscent * scale, left: probe.actualBoundingBoxLeft * scale } };
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

/** Կիսաթափանցիկ շերտ՝ փափուկ եզրերով։ */
function drawShade(context: CanvasRenderingContext2D, rect: Rect, shade: number, darkText: boolean) {
  if (shade <= 0.01) return;
  const alpha = Math.min(0.88, shade * 0.85);
  const color = darkText ? `rgba(255, 249, 236, ${alpha})` : `rgba(16, 9, 20, ${alpha})`;
  context.save();
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 40;
  roundedRect(context, rect, 38);
  context.fill();
  context.restore();
}

/** Կեղծ-պատահական թիվ (նույն տեքստի համար՝ նույն կայծերը)։ */
function seeded(seed: number) {
  let value = seed || 1;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

function sparkle(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.save();
  context.translate(x, y);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius * 1.6);
  glow.addColorStop(0, "rgba(255, 246, 214, 0.9)");
  glow.addColorStop(1, "rgba(255, 210, 120, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, radius * 1.6, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255, 250, 230, 0.95)";
  context.beginPath();
  // Չորս ճառագայթով աստղիկ
  for (let point = 0; point < 8; point += 1) {
    const angle = (point * Math.PI) / 4;
    const length = point % 2 === 0 ? radius : radius * 0.18;
    context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function goldFill(context: CanvasRenderingContext2D, top: number, size: number) {
  const fill = context.createLinearGradient(0, top - size * 0.1, 0, top + size * 1.05);
  fill.addColorStop(0, "#fff3d2");
  fill.addColorStop(0.32, "#f2d38e");
  fill.addColorStop(0.58, "#c9953f");
  fill.addColorStop(0.8, "#f5dc9c");
  fill.addColorStop(1, "#b9862e");
  return fill;
}

/**
 * Տող՝ ընտրված էֆեկտով. «Լույս»՝ փափուկ լուսապսակ, «Ոսկի»՝ ոսկու երանգ և լույս, «Ստվեր»՝ մուգ ստվեր։
 * `baseline`-ը տողի բազային գիծն է, `size`-ը՝ տառի չափը։
 */
function paintLine(context: CanvasRenderingContext2D, value: string, x: number, baseline: number, size: number, color: string, effect: StoryEffect) {
  const darkText = luminance(color) < 128;
  context.save();
  if (effect === "shadow") {
    context.shadowColor = darkText ? "rgba(255, 250, 240, 0.7)" : "rgba(0, 0, 0, 0.55)";
    context.shadowBlur = size * 0.32;
    context.shadowOffsetY = size * 0.05;
  }
  if (effect === "glow" || effect === "gold") {
    // Լուսապսակը՝ երկու շերտով. լայն և մեղմ, ապա նեղ և պայծառ։
    const halo = effect === "gold" ? "rgba(255, 196, 92, 0.5)" : darkText ? "rgba(255, 248, 228, 0.95)" : "rgba(255, 205, 120, 0.6)";
    context.fillStyle = effect === "gold" ? goldFill(context, baseline - size * 0.8, size) : color;
    context.shadowColor = halo;
    context.shadowBlur = size * 0.65;
    context.fillText(value, x, baseline);
    context.shadowBlur = size * 0.28;
    context.fillText(value, x, baseline);
    context.shadowColor = "transparent";
  }
  context.fillStyle = effect === "gold" ? goldFill(context, baseline - size * 0.8, size) : color;
  context.fillText(value, x, baseline);
  context.restore();
}

/** Ոսկե կայծեր տեքստի շուրջը (միայն «Ոսկի» էֆեկտով)։ */
function drawSparkles(context: CanvasRenderingContext2D, rect: Rect, seedText: string, count: number, size: number) {
  let seed = 0;
  for (const character of seedText) seed = (seed * 31 + (character.codePointAt(0) ?? 0)) % 2147483647;
  const random = seeded(seed);
  for (let index = 0; index < count; index += 1) {
    const x = rect.left + random() * rect.width;
    const y = rect.top + random() * rect.height;
    sparkle(context, x, y, size * (0.18 + random() * 0.22));
  }
}

export type StoryHit = { frame: Rect; title: Rect | null };
/** Մեջտեղի օգնական գծերը (քաշելիս). x՝ ուղղահայաց գիծ, y՝ հորիզոնական։ */
export type StoryGuides = { x: boolean; y: boolean };

function drawGuides(context: CanvasRenderingContext2D, guides: StoryGuides) {
  context.save();
  // Թույլ ցանց (երրորդներ) և մեջտեղի գծերը. կպչելու դեպքում՝ ոսկեգույն։
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.setLineDash([10, 14]);
  for (const x of [STORY_WIDTH / 3, (STORY_WIDTH * 2) / 3]) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, STORY_HEIGHT); context.stroke(); }
  for (const y of [STORY_HEIGHT / 3, (STORY_HEIGHT * 2) / 3]) { context.beginPath(); context.moveTo(0, y); context.lineTo(STORY_WIDTH, y); context.stroke(); }
  context.setLineDash([]);
  context.lineWidth = 4;
  context.strokeStyle = guides.x ? "#f0d397" : "rgba(255, 255, 255, 0.28)";
  context.beginPath(); context.moveTo(STORY_WIDTH / 2, 0); context.lineTo(STORY_WIDTH / 2, STORY_HEIGHT); context.stroke();
  context.strokeStyle = guides.y ? "#f0d397" : "rgba(255, 255, 255, 0.28)";
  context.beginPath(); context.moveTo(0, STORY_HEIGHT / 2); context.lineTo(STORY_WIDTH, STORY_HEIGHT / 2); context.stroke();
  context.restore();
}

/** Նկարում է մեկ էջը։ Վերադարձնում է վերնագրի և շրջանակի տեղերը (քաշելու համար)։ */
export function drawStoryPage(context: CanvasRenderingContext2D, options: {
  background: StoryBackground;
  image: HTMLImageElement | null;
  brightness: Brightness | null;
  style: StoryStyle;
  layout: StoryLayout;
  plan: StoryPlanWithCap;
  page: number;
  title: string;
  /** Խմբագրում՝ եզրագծեր և շրջանակի չափը փոխելու կետեր։ */
  outline?: "title" | "text" | null;
  guides?: StoryGuides | null;
}): StoryHit {
  const { background, image, brightness, style, layout, plan, page, title, outline, guides } = options;
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
  if (guides) drawGuides(context, guides);
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
    drawShade(context, grow(titleRect, SHADE_PAD * 0.7), style.title.shade, style.title.effect !== "gold" && luminance(color) < 128);
    context.textAlign = "center";
    context.font = `${TITLE_WEIGHT[style.title.font]} ${pixels}px ${FAMILY[style.title.font]}`;
    let shown = header;
    while (shown.length > 4 && context.measureText(shown).width > SAFE.right - SAFE.left) shown = `${shown.slice(0, -2)}…`;
    paintLine(context, shown, place.x, place.y + pixels, pixels, color, style.title.effect);
    // Բարակ գիծ վերնագրի տակ՝ եզրերից մարող
    const line = context.createLinearGradient(place.x - 70, 0, place.x + 70, 0);
    const lineColor = style.title.effect === "gold" ? "232, 197, 127" : luminance(color) < 128 ? "110, 31, 43" : "232, 197, 127";
    line.addColorStop(0, `rgba(${lineColor}, 0)`);
    line.addColorStop(0.5, `rgba(${lineColor}, 0.9)`);
    line.addColorStop(1, `rgba(${lineColor}, 0)`);
    context.fillStyle = line;
    context.fillRect(place.x - 70, place.y + pixels * 1.25 + 14, 140, 3);
    if (style.title.effect === "gold") drawSparkles(context, grow(titleRect, 10), `${title}-t`, 3, pixels);
  }

  // Տեքստ. շրջանակի մեջ, ուղղահայաց՝ մեջտեղում
  const capHeight = plan.initial && page === 0 ? size * LINE_HEIGHT * 2 : 0;
  const height = Math.max(plan.pages[page]?.height ?? 0, capHeight);
  const top = frame.top + Math.max(0, (frame.height - height) / 2);
  const textArea = { left: frame.left, top, width: frame.width, height: Math.max(height, size) };
  const color = colorsFor(style.text, textArea, brightness, background.tone, false);
  drawShade(context, grow(frame, SHADE_PAD), style.text.shade, style.text.effect !== "gold" && luminance(color) < 128);
  if (!style.title.show && plan.pages.length > 1) {
    context.textAlign = "center";
    context.font = `600 34px ${FAMILY.serif}`;
    paintLine(context, `${page + 1}/${plan.pages.length}`, frame.left + frame.width / 2, Math.max(SAFE.top + 34, frame.top - 20), 34, color, "none");
  }
  // Զարդատառ (թռչնագիր). գունավոր տառատեսակը իր գույներն ունի։
  if (plan.initial && page === 0) {
    context.save();
    context.textAlign = "left";
    context.font = `400 ${plan.initial.size}px ${ORNATE_FAMILY}`;
    context.fillStyle = style.text.effect === "gold" ? "#e8c57f" : color;
    context.shadowColor = "rgba(255, 210, 130, 0.35)";
    context.shadowBlur = size * 0.4;
    context.fillText(plan.initial.letter, frame.left + plan.initial.left, top + size * 0.12 + plan.initial.ascent);
    context.restore();
  }
  context.font = `400 ${size}px ${FAMILY[style.text.font]}`;
  context.textAlign = style.text.align === "center" ? "center" : "left";
  let y = top;
  lines.forEach((entry, index) => {
    if (index > 0 && entry.paragraphStart) y += size * PARAGRAPH_GAP;
    const left = frame.left + entry.indent;
    const x = style.text.align === "center" ? left + (frame.width - entry.indent) / 2 : left;
    paintLine(context, entry.text, x, y + size * (LINE_HEIGHT / 2 + 0.33), size, color, style.text.effect);
    y += size * LINE_HEIGHT;
  });
  if (style.text.effect === "gold") drawSparkles(context, grow(textArea, 6), lines.map((entry) => entry.text).join(""), Math.min(7, 2 + Math.round(lines.length / 3)), size);

  if (outline !== undefined) {
    const darkText = luminance(color) < 128;
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
