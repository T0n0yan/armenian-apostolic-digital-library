/**
 * Նյութի ուղղահայաց նկար (9:16, 1080×1920)՝ Instagram/Telegram-ում կիսվելու համար։
 * Նկարվում է հեռախոսում (canvas), որ սերվերի CPU չծախսվի. ոճը՝ og-քարտերի մագաղաթն ու ոսկին։
 */
import { excerpt } from "./og-card-layout";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type StoryContent = {
  /** Բաժինը՝ «Սաղմոսներ», «Աղոթքներ», … */
  section: string;
  /** Վերնագիրը՝ «Սաղմոս 22, համար 3», աղոթքի անունը, … */
  title: string;
  /** Տեքստի կտորը (կկրճատվի)։ */
  text: string;
  /** false՝ առանց չակերտների (օր.՝ հարց)։ */
  quoted?: boolean;
};

const FONT = '"Noto Serif Armenian", Georgia, serif';
const TEXT_WIDTH = 860;
/** Տեքստի բլոկի առավելագույն բարձրությունը (վերնագրի և ստորագրի միջև)։ */
const TEXT_MAX_HEIGHT = 1060;

/** Բառերը տողերի է բաժանում՝ `measure`-ով չափելով, որ ոչ մի տող `width`-ից լայն չլինի։ */
export function wrapLines(text: string, width: number, measure: (line: string) => number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Ընտրում է տեքստի չափը. սկսում է մեծից և փոքրացնում, մինչև տեղավորվի։ Չտեղավորվելու դեպքում
 * կտորը կարճացնում է։ `measure(line, size)`՝ տողի լայնությունը տվյալ չափով։
 */
export function fitStoryText(text: string, measure: (line: string, size: number) => number) {
  let passage = excerpt(text, 280);
  for (;;) {
    for (let size = 72; size >= 40; size -= 4) {
      const lines = wrapLines(passage, TEXT_WIDTH, (line) => measure(line, size));
      if (lines.length * size * 1.5 <= TEXT_MAX_HEIGHT) return { size, lines, passage };
    }
    const shorter = excerpt(passage, Math.floor(passage.length * 0.8));
    if (shorter.length >= passage.length || shorter.length < 40) {
      const lines = wrapLines(shorter, TEXT_WIDTH, (line) => measure(line, 40));
      return { size: 40, lines: lines.slice(0, Math.floor(TEXT_MAX_HEIGHT / 60)), passage: shorter };
    }
    passage = shorter;
  }
}

function gold(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, "rgba(176,125,46,0)");
  gradient.addColorStop(0.5, "#b07d2e");
  gradient.addColorStop(1, "rgba(176,125,46,0)");
  return gradient;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Հայկական խաչ՝ ոսկեգույն, ծաղկավոր ծայրերով։ */
function cross(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.fillStyle = "#b07d2e";
  const arm = size / 2;
  const bar = size * 0.12;
  ctx.fillRect(cx - bar / 2, cy - arm, bar, size);
  ctx.fillRect(cx - arm, cy - bar / 2, size, bar);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const ex = cx + dx * arm;
    const ey = cy + dy * arm;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex + (dy ? side * bar : 0), ey + (dx ? side * bar : 0), bar * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, bar * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Նկարում է story-նկարը և վերադարձնում PNG։ */
export async function drawStoryImage(content: StoryContent): Promise<Blob> {
  // Տառատեսակը նախ պետք է բեռնված լինի, այլապես canvas-ը կնկարի պարզ տառով։
  await Promise.all([document.fonts.load(`400 48px ${FONT}`, "Աա"), document.fonts.load(`600 48px ${FONT}`, "Աա")]).catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const W = STORY_WIDTH;
  const H = STORY_HEIGHT;

  // Մագաղաթ՝ վերևից լույս, եզրերին տաք ստվեր։
  const base = ctx.createLinearGradient(0, 0, W * 0.3, H);
  base.addColorStop(0, "#f5ebd3");
  base.addColorStop(0.55, "#ead9b8");
  base.addColorStop(1, "#e2cda4");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -100, 0, W / 2, -100, H * 0.75);
  glow.addColorStop(0, "rgba(255,248,226,0.95)");
  glow.addColorStop(1, "rgba(255,248,226,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  vignette.addColorStop(0, "rgba(150,100,40,0)");
  vignette.addColorStop(1, "rgba(150,100,40,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Կրկնակի ոսկե շրջանակ։
  ctx.strokeStyle = "rgba(176,125,46,0.6)";
  ctx.lineWidth = 3;
  roundRect(ctx, 56, 56, W - 112, H - 112, 36);
  ctx.stroke();
  ctx.strokeStyle = "rgba(176,125,46,0.3)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 74, 74, W - 148, H - 148, 26);
  ctx.stroke();

  // Վերև՝ խաչ, բաժին, վերնագիր, բաժանարար։
  cross(ctx, W / 2, 250, 84);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8a5a1c";
  ctx.font = `400 34px ${FONT}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(content.section.toLocaleUpperCase("hy"), W / 2, 370);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#a06d22";
  const titleSize = content.title.length > 34 ? 48 : 58;
  ctx.font = `600 ${titleSize}px ${FONT}`;
  const titleLines = wrapLines(excerpt(content.title, 70), TEXT_WIDTH, (line) => ctx.measureText(line).width).slice(0, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, W / 2, 455 + index * titleSize * 1.25));
  const dividerY = 455 + (titleLines.length - 1) * titleSize * 1.25 + 50;
  ctx.fillStyle = gold(ctx, W / 2 - 160, W / 2 + 160);
  ctx.fillRect(W / 2 - 160, dividerY, 320, 3);

  // Մեջտեղում՝ տեքստը։
  const quoted = content.quoted !== false;
  const fit = fitStoryText(content.text, (line, size) => { ctx.font = `400 ${size}px ${FONT}`; return ctx.measureText(line).width; });
  const lines = [...fit.lines];
  if (quoted && lines.length) {
    lines[0] = `«${lines[0]}`;
    lines[lines.length - 1] = `${lines[lines.length - 1]}»`;
  }
  ctx.font = `400 ${fit.size}px ${FONT}`;
  ctx.fillStyle = "#3a2412";
  const lineHeight = fit.size * 1.5;
  const top = dividerY + 40;
  const bottom = H - 300;
  let y = top + (bottom - top - lines.length * lineHeight) / 2 + fit.size;
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += lineHeight; }

  // Ներքևում՝ փոքր զարդ և աննկատ հասցե։
  ctx.fillStyle = gold(ctx, W / 2 - 90, W / 2 + 90);
  ctx.fillRect(W / 2 - 90, H - 230, 180, 2);
  ctx.fillStyle = "rgba(122,90,58,0.7)";
  ctx.font = `400 30px ${FONT}`;
  ctx.letterSpacing = "3px";
  ctx.fillText("apostolic.am", W / 2, H - 165);
  ctx.letterSpacing = "0px";

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob")), "image/png"));
}

const comparable = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase("hy");

/** Նյութից՝ story-ի բովանդակություն. տեքստի սկզբի վերնագիրը չի կրկնվում, հարցը՝ առանց չակերտների։ */
export function storyFromMaterial({ title, section, text, question = false }: { title: string; section: string; text: string; question?: boolean }): StoryContent {
  let body = text.replace(/\s+/gu, " ").trim();
  if (title.trim() && comparable(body).startsWith(comparable(title))) {
    body = body.split(" ").slice(title.trim().split(/\s+/u).length).join(" ").replace(/^[\s,։:.;—–-]+/u, "");
  }
  return { section, title, text: body || title, quoted: !question };
}
