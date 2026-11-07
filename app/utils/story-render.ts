// Story-ի նկարը canvas-ի վրա (միայն բրաուզերում)։ Դասավորությունը՝ story-layout.ts։

import type { StoryBackground } from "./story-backgrounds";
import { STORY_BOX } from "./story-backgrounds";
import {
  LINE_HEIGHT, PARAGRAPH_GAP, STORY_HEIGHT, STORY_WIDTH, blockTop, planStory,
  type StoryAlign, type StoryPlan, type StoryPosition, type StorySize,
} from "./story-layout";

export type StoryFont = "book" | "serif";
export type StoryShade = 0 | 1 | 2;

export const STORY_COLORS = [
  { id: "cream", value: "#f7ecd2", label: "Կաթնագույն" },
  { id: "white", value: "#ffffff", label: "Սպիտակ" },
  { id: "gold", value: "#e8c57f", label: "Ոսկեգույն" },
  { id: "wine", value: "#6e1f2b", label: "Բալագույն" },
  { id: "ink", value: "#24150d", label: "Մուգ" },
] as const;
export type StoryColor = (typeof STORY_COLORS)[number]["id"];

export type StoryStyle = {
  size: StorySize;
  position: StoryPosition;
  align: StoryAlign;
  color: StoryColor;
  font: StoryFont;
  shade: StoryShade;
};

const FAMILY: Record<StoryFont, string> = {
  book: '"Arian Grqi", "Noto Serif Armenian", Georgia, serif',
  serif: '"Noto Serif Armenian", Georgia, serif',
};
const TITLE_FAMILY = '"Noto Serif Armenian", Georgia, serif';
const TITLE_SIZE = 36;
/** Վերնագրի տողը տեքստի վերևում (վերնագիր + բարակ գիծ)։ */
const HEADER = 104;
const SHADE_PAD = 52;

function isDark(color: string) {
  const value = Number.parseInt(color.slice(1), 16);
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  return luminance < 128;
}

export function defaultColor(background: StoryBackground): StoryColor {
  return background.tone === "dark" ? "cream" : "ink";
}

/** Տառատեսակները պետք է բեռնված լինեն, թե չէ canvas-ը կնկարի այլ տառերով։ */
export async function loadStoryFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = "Տէր Աստուած";
  await Promise.all([
    document.fonts.load(`400 48px "Arian Grqi"`, sample),
    document.fonts.load(`400 48px "Noto Serif Armenian"`, sample),
    document.fonts.load(`600 36px "Noto Serif Armenian"`, sample),
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

function textBox() {
  return { ...STORY_BOX, top: STORY_BOX.top + HEADER };
}

export function planFor(context: CanvasRenderingContext2D, text: string, style: StoryStyle): StoryPlan {
  return planStory(text, style.size, textBox(), (value, size) => {
    context.font = `400 ${size}px ${FAMILY[style.font]}`;
    return context.measureText(value).width;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/** Նկարում է մեկ էջը։ `image`-ը նկարով ֆոնի համար է (բեռնված)։ */
export function drawStoryPage(context: CanvasRenderingContext2D, options: {
  background: StoryBackground;
  image: HTMLImageElement | null;
  style: StoryStyle;
  plan: StoryPlan;
  page: number;
  title: string;
}) {
  const { background, image, style, plan, page, title } = options;
  const { size } = plan;
  const lines = plan.pages[page]?.lines ?? [];
  const color = STORY_COLORS.find((entry) => entry.id === style.color)?.value ?? "#f7ecd2";
  const darkText = isDark(color);
  context.save();
  context.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Ֆոն
  if (image) {
    context.drawImage(image, 0, 0, STORY_WIDTH, STORY_HEIGHT);
  } else {
    const [from, to] = background.gradient ?? ["#2b1638", "#0f0a18"];
    const fill = context.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    fill.addColorStop(0, from);
    fill.addColorStop(1, to);
    context.fillStyle = fill;
    context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  }

  const box = textBox();
  const height = plan.pages[page]?.height ?? 0;
  const top = blockTop(style.position, box, height);
  const headerTop = top - HEADER;

  // Կիսաթափանցիկ շերտ տեքստի տակ, որ կարդացվի ցանկացած ֆոնի վրա։
  if (style.shade) {
    const alpha = style.shade === 1 ? (darkText ? 0.5 : 0.3) : (darkText ? 0.72 : 0.5);
    context.fillStyle = darkText ? `rgba(255, 250, 240, ${alpha})` : `rgba(14, 8, 16, ${alpha})`;
    roundedRect(context, box.left - SHADE_PAD, headerTop - SHADE_PAD + 8, box.right - box.left + SHADE_PAD * 2, height + HEADER + SHADE_PAD * 2 - 8, 44);
    context.fill();
  }

  // Վերնագիր և էջի համարը
  const accent = darkText ? "#7a2430" : "#e8c57f";
  context.fillStyle = accent;
  context.textBaseline = "alphabetic";
  context.font = `600 ${TITLE_SIZE}px ${TITLE_FAMILY}`;
  const header = plan.pages.length > 1 ? `${title} · ${page + 1}/${plan.pages.length}` : title;
  const centerX = (box.left + box.right) / 2;
  context.textAlign = style.align === "center" ? "center" : "left";
  const headerX = style.align === "center" ? centerX : box.left;
  let shown = header;
  while (shown.length > 4 && context.measureText(shown).width > box.right - box.left) shown = `${shown.slice(0, -2)}…`;
  context.fillText(shown, headerX, headerTop + TITLE_SIZE);
  context.globalAlpha = 0.7;
  context.fillRect(style.align === "center" ? centerX - 44 : box.left, headerTop + TITLE_SIZE + 26, 88, 3);
  context.globalAlpha = 1;

  // Տեքստ
  context.fillStyle = color;
  context.font = `400 ${size}px ${FAMILY[style.font]}`;
  if (!darkText) {
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = style.shade ? 6 : 14;
  }
  let y = top;
  lines.forEach((line, index) => {
    if (index > 0 && line.paragraphStart) y += size * PARAGRAPH_GAP;
    // Տողի բազային գիծը՝ տողի բարձրության մեջտեղից մի փոքր ներքև։
    context.fillText(line.text, style.align === "center" ? centerX : box.left, y + size * (LINE_HEIGHT / 2 + 0.33));
    y += size * LINE_HEIGHT;
  });
  context.shadowColor = "transparent";
  context.shadowBlur = 0;

  // apostolic.am՝ գունային ֆոնի վրա (նկարներում այն արդեն կա)։ Ընթերցողը չի կարող այն փոխել։
  if (!background.hasMark) {
    context.textAlign = "center";
    context.fillStyle = background.tone === "dark" ? "rgba(247, 236, 210, 0.82)" : "rgba(60, 30, 20, 0.78)";
    context.font = `600 40px ${TITLE_FAMILY}`;
    context.fillText("apostolic.am", STORY_WIDTH / 2, STORY_HEIGHT - 150);
  }
  context.restore();
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
