import { Check, ChevronLeft, ChevronRight, Download, Link2, Minus, Plus, RotateCcw, Send, Share2, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../utils/scroll-lock";
import { STORY_DESIGNS, storyBackground, type StoryTone } from "../utils/story-backgrounds";
import { STORY_HEIGHT, STORY_WIDTH, fitCount, joinUnits, storyUnits, type StoryAlign, type StoryPlan } from "../utils/story-layout";
import {
  DEFAULT_STYLE, TEXT_SIZES, TITLE_SIZES, canvasBlob, clampFrame, defaultLayout, drawStoryPage, frameHandles, loadBackground,
  loadStoryFonts, measureBrightness, planFor,
  type Brightness, type Handle, type PartStyle, type Rect, type StoryFont, type StoryHit, type StoryLayout, type StoryShade, type StoryStyle,
} from "../utils/story-render";
import { systemShare } from "./share-button";

export type StorySource = { title: string; text: string; path: string };

type StoryWebApp = {
  initData?: string;
  isVersionAtLeast?: (version: string) => boolean;
  shareToStory?: (mediaUrl: string, params?: { text?: string }) => void;
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
};

function telegramApp() {
  const app = (window as { Telegram?: { WebApp?: StoryWebApp } }).Telegram?.WebApp;
  return app?.initData ? app : null;
}

const SETTINGS_KEY = "story-style-v3";
const COLORS_KEY = "story-colors";
type Saved = { style?: StoryStyle; design?: string; tone?: StoryTone };

function readJson<T>(key: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Պահելը պարտադիր չէ։ */ }
}

/** HSL → #rrggbb */
function hsl(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Գույների ամբողջական ցանկը. ոսկի/մագաղաթ, մոխրագույներ և 12 երանգ՝ 3 պայծառությամբ։ */
const PALETTE = [
  "#f7ecd2", "#e8c57f", "#b07d2e", "#6e1f2b", "#24150d", "#ffffff", "#000000", "#8a8178",
  ...[82, 62, 40].flatMap((lightness) => [0, 22, 40, 52, 95, 145, 178, 205, 228, 262, 292, 330]
    .map((hue) => hsl(hue, lightness > 70 ? 70 : 62, lightness))),
];

const ALIGNS: Array<[StoryAlign, string]> = [["center", "Մեջտեղում"], ["start", "Ձախից"]];
const FONTS: Array<[StoryFont, string]> = [["book", "Գրքային"], ["serif", "Նոտո"]];
const SHADES: Array<[StoryShade, string]> = [[0, "Չկա"], [1, "Թեթև"], [2, "Խիտ"]];
const TONES: Array<[StoryTone, string]> = [["dark", "Մուգ"], ["light", "Բաց"]];
type Tab = "background" | "title" | "text";
const TABS: Array<[Tab, string]> = [["background", "Ֆոն"], ["title", "Վերնագիր"], ["text", "Տեքստ"]];
type TextMode = "fit" | "all" | "custom";

function Segmented<T extends string | number | boolean>({ label, value, options, onChange }: {
  label?: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      {label ? <span className="text-[12px] font-bold text-muted">{label}</span> : null}
      <div className="flex gap-1 rounded-[13px] border border-glass-border bg-subtle p-1" role="radiogroup" aria-label={label}>
        {options.map(([option, text]) => (
          <button key={String(option)} type="button" role="radio" aria-checked={option === value}
            className={`min-h-9 flex-1 cursor-pointer rounded-[10px] border-0 px-1 text-[12.5px] font-bold ${option === value ? "bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]" : "bg-transparent text-ink"}`}
            onClick={() => onChange(option)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-bold text-muted">{label}</span>{aside}</div>
      {children}
    </div>
  );
}

/** Չափը պիքսելներով՝ սահիչով և −/+ կոճակներով։ */
function SizeControl({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const step = "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-glass-border bg-subtle text-ink disabled:opacity-40";
  return (
    <Row label="Տառի չափ" aside={<b className="text-[13px] text-ink tabular-nums">{value} px</b>}>
      <div className="flex items-center gap-2">
        <button className={step} type="button" aria-label="Փոքրացնել" disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={16} aria-hidden="true" /></button>
        <input className="h-9 min-w-0 flex-1 cursor-pointer accent-[#d9b56f]" type="range" min={min} max={max} step={1} value={value}
          aria-label="Տառի չափը պիքսելներով" onChange={(event) => onChange(Number(event.target.value))} />
        <button className={step} type="button" aria-label="Մեծացնել" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} aria-hidden="true" /></button>
      </div>
    </Row>
  );
}

/** Գույնը. «Ավտո», վերջին ընտրվածները և ամբողջ ցանկը միանգամից։ */
function ColorControl({ value, recent, onChange }: { value: string; recent: string[]; onChange: (value: string) => void }) {
  const swatch = (color: string, key: string) => (
    <button key={key} type="button" role="radio" aria-checked={value === color} aria-label={color} title={color}
      className={`aspect-square w-full cursor-pointer rounded-full border-2 ${value === color ? "border-[#d9b56f] shadow-[0_0_0_2px_rgb(217_181_111/45%)]" : "border-[rgb(127_127_127/30%)]"}`}
      style={{ background: color }} onClick={() => onChange(color)} />
  );
  return (
    <Row label="Գույն">
      <div className="grid gap-2" role="radiogroup" aria-label="Գույն">
        <div className="flex items-center gap-2">
          <button type="button" role="radio" aria-checked={value === "auto"} onClick={() => onChange("auto")}
            className={`min-h-9 shrink-0 cursor-pointer rounded-full border-2 px-3 text-[12px] font-bold text-ink ${value === "auto" ? "border-[#d9b56f] bg-[rgb(217_181_111/18%)]" : "border-glass-border bg-subtle"}`}>Ավտո</button>
          {recent.length ? <div className="grid flex-1 grid-cols-8 gap-1.5">{recent.map((color) => swatch(color, `recent-${color}`))}</div>
            : <span className="text-[11.5px] text-muted">հակառակ գույնը՝ ըստ ֆոնի</span>}
        </div>
        <div className="grid grid-cols-8 gap-1.5 rounded-[13px] border border-glass-border bg-subtle p-2">
          {PALETTE.map((color) => swatch(color, color))}
        </div>
      </div>
    </Row>
  );
}

function fileName(path: string, page: number, pages: number) {
  const slug = path.replace(/^\/+|\/+$/gu, "").replaceAll("/", "-") || "apostolic";
  return `apostolic-am-${slug}${pages > 1 ? `-${page + 1}` : ""}.jpg`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

const range = (count: number) => new Set(Array.from({ length: count }, (_, index) => index));

type Drag =
  | { kind: "title"; x: number; y: number; origin: StoryLayout; live: StoryLayout }
  | { kind: "frame"; x: number; y: number; origin: StoryLayout; live: StoryLayout }
  | { kind: "resize"; handle: Handle; x: number; y: number; origin: StoryLayout; live: StoryLayout };

function resize(frame: Rect, handle: Handle, dx: number, dy: number): Rect {
  const next = { ...frame };
  if (handle === "right" || handle === "corner") next.width = frame.width + dx;
  if (handle === "bottom" || handle === "corner") next.height = frame.height + dy;
  if (handle === "left") { next.left = frame.left + dx; next.width = frame.width - dx; }
  if (handle === "top") { next.top = frame.top + dy; next.height = frame.height - dy; }
  const clamped = clampFrame(next);
  // Ձախ/վերև կետը քաշելիս հակառակ կողմը մնում է տեղում։
  if (handle === "left") clamped.left = Math.min(clamped.left, frame.left + frame.width - clamped.width);
  if (handle === "top") clamped.top = Math.min(clamped.top, frame.top + frame.height - clamped.height);
  return clamped;
}

/**
 * Աղոթքը, սաղմոսը կամ համարը՝ story-ի նկար (1080×1920)։ Բացվելիս միանգամից ցույց է տալիս
 * պատրաստի նկարը։ «Կարգավորել»-ում երեք բաժին կա՝ Ֆոն, Վերնագիր, Տեքստ, ամեն մեկն իր չափով,
 * գույնով, տառատեսակով և տակի շերտով։ Տեքստի շրջանակը քաշվում և լայնացվում է մատով, և դրանից է
 * կախված, թե որքան տեքստ է տեղավորվում։ apostolic.am-ը միշտ բաց է մնում։
 */
export function StoryEditor({ source, onClose, onLink }: { source: StorySource; onClose: () => void; onLink: () => void }) {
  useScrollLock(true);
  const saved = useMemo(() => readJson<Saved>(SETTINGS_KEY, {}), []);
  const [design, setDesign] = useState(() => saved.design ?? STORY_DESIGNS[0].id);
  const [tone, setTone] = useState<StoryTone>(() => saved.tone ?? "dark");
  const background = useMemo(() => storyBackground(design, tone), [design, tone]);
  const [style, setStyle] = useState<StoryStyle>(() => ({
    title: { ...DEFAULT_STYLE.title, ...saved.style?.title },
    text: { ...DEFAULT_STYLE.text, ...saved.style?.text },
  }));
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(COLORS_KEY, []));
  const units = useMemo(() => storyUnits(source.text), [source.text]);
  const [textMode, setTextMode] = useState<TextMode>("fit");
  const [custom, setCustom] = useState<Set<number>>(() => range(units.length));
  const [layout, setLayout] = useState<StoryLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("text");
  const [picking, setPicking] = useState(false);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [shownCount, setShownCount] = useState(0);
  const [tooLong, setTooLong] = useState(false);
  const [assets, setAssets] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const brightnessRef = useRef<Brightness | null>(null);
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);
  const hitRef = useRef<StoryHit | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef(0);
  const layoutDesignRef = useRef("");
  // Պատրաստի ֆայլերը՝ որ «Կիսվել»-ը անմիջապես բացի պատուհանը (iOS-ը սպասել չի թողնում)։
  const filesRef = useRef<File[] | null>(null);
  const telegram = typeof window === "undefined" ? null : telegramApp();
  const canStory = Boolean(telegram?.shareToStory && telegram.isVersionAtLeast?.("7.8"));
  const canDownloadInTelegram = Boolean(telegram?.downloadFile && telegram.isVersionAtLeast?.("8.0"));
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.jpg", { type: "image/jpeg" })] });

  useEffect(() => { writeJson(SETTINGS_KEY, { style, design, tone }); }, [design, style, tone]);

  const setPart = useCallback(<K extends "title" | "text">(part: K, patch: Partial<StoryStyle[K]>) =>
    setStyle((current) => ({ ...current, [part]: { ...current[part], ...patch } })), []);

  const chooseColor = (part: "title" | "text", color: string) => {
    setPart(part, { color } as Partial<PartStyle>);
    if (color === "auto") return;
    // Ընտրված գույնը ավելանում է «վերջինների» շարքում։
    setRecent((current) => {
      const next = [color, ...current.filter((entry) => entry !== color)].slice(0, 8);
      writeJson(COLORS_KEY, next);
      return next;
    });
  };

  // Ֆոնը և տառատեսակները
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadStoryFonts();
      const image = await loadBackground(background.src);
      if (cancelled) return;
      imageRef.current = image;
      brightnessRef.current = measureBrightness(image);
      if (!measureRef.current) measureRef.current = document.createElement("canvas").getContext("2d");
      setAssets((value) => value + 1);
    })();
    return () => { cancelled = true; };
  }, [background.src]);

  // Նոր ձևավորման դեպքում՝ նրա սկզբնական դասավորությունը (զարդերը տարբեր տեղերում են)։
  useEffect(() => {
    if (!assets || layoutDesignRef.current === design) return;
    layoutDesignRef.current = design;
    setLayout(defaultLayout(background, style));
  }, [assets, background, design, style]);

  /** Պլանը տրված դասավորությամբ. «Ըստ շրջանակի»-ն վերցնում է այնքան, որքան տեղավորվում է։ */
  const computePlan = useCallback((current: StoryLayout): { plan: StoryPlan; count: number } | null => {
    const context = measureRef.current;
    if (!context) return null;
    const plan = (set: Set<number>) => planFor(context, joinUnits(units, set), style, current.frame);
    if (textMode === "all") return { plan: plan(range(units.length)), count: units.length };
    if (textMode === "custom") return { plan: plan(custom), count: custom.size };
    const count = fitCount(units.length, (value) => plan(range(value)).pages.length === 1);
    return { plan: plan(range(count)), count };
  }, [custom, style, textMode, units]);

  const draw = useCallback((current: StoryLayout) => {
    const context = previewRef.current?.getContext("2d");
    const result = computePlan(current);
    if (!context || !result) return null;
    const shownPage = Math.min(page, result.plan.pages.length - 1);
    hitRef.current = drawStoryPage(context, {
      background, image: imageRef.current, brightness: brightnessRef.current, style, layout: current, plan: result.plan,
      page: shownPage, title: source.title, outline: editing ? (tab === "background" ? null : tab) : undefined,
    });
    return result;
  }, [background, computePlan, editing, page, source.title, style, tab]);

  // Նախադիտում
  useEffect(() => {
    if (!assets || !layout) return;
    const result = draw(layout);
    if (!result) return;
    setPageCount(result.plan.pages.length);
    setShownCount(result.count);
    setTooLong(result.plan.tooLong);
    if (page > result.plan.pages.length - 1) setPage(result.plan.pages.length - 1);
  }, [assets, draw, layout, page]);

  // Պատրաստի ֆայլերը (փոփոխություններից կարճ ժամանակ անց)
  useEffect(() => {
    if (!assets || !layout) return;
    let cancelled = false;
    filesRef.current = null;
    setReady(false);
    const timer = window.setTimeout(async () => {
      const result = computePlan(layout);
      if (!result || result.plan.tooLong) return;
      const work = document.createElement("canvas");
      work.width = STORY_WIDTH;
      work.height = STORY_HEIGHT;
      const context = work.getContext("2d");
      if (!context) return;
      const files: File[] = [];
      for (let index = 0; index < result.plan.pages.length; index += 1) {
        drawStoryPage(context, { background, image: imageRef.current, brightness: brightnessRef.current, style, layout, plan: result.plan, page: index, title: source.title });
        const blob = await canvasBlob(work);
        if (cancelled || !blob) return;
        files.push(new File([blob], fileName(source.path, index, result.plan.pages.length), { type: "image/jpeg" }));
      }
      filesRef.current = files;
      setReady(true);
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [assets, background, computePlan, layout, source.path, source.title, style]);

  // Մատով. վերնագիրը տեղափոխել, շրջանակը տեղափոխել կամ չափը փոխել
  const toCanvas = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * STORY_WIDTH, y: ((event.clientY - box.top) / box.height) * STORY_HEIGHT };
  };
  const inside = (rect: Rect | null | undefined, point: { x: number; y: number }, pad: number) =>
    Boolean(rect && point.x >= rect.left - pad && point.x <= rect.left + rect.width + pad && point.y >= rect.top - pad && point.y <= rect.top + rect.height + pad);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!layout || !hitRef.current) return;
    const point = toCanvas(event);
    // Փոքր նախադիտման վրա մատը կոպիտ է. կետերը «բռնվում» են լայն շառավղով։
    const reach = (90 * STORY_WIDTH) / Math.max(event.currentTarget.getBoundingClientRect().width * 4, 1);
    const handle = editing && tab === "text"
      ? frameHandles(layout.frame).find(([hx, hy]) => Math.hypot(point.x - hx, point.y - hy) < Math.max(reach, 70))?.[2]
      : undefined;
    let drag: Drag | null = null;
    const base = { x: point.x, y: point.y, origin: layout, live: layout };
    if (handle) drag = { kind: "resize", handle, ...base };
    else if (inside(hitRef.current.title, point, 24)) drag = { kind: "title", ...base };
    else if (inside(hitRef.current.frame, point, 16)) drag = { kind: "frame", ...base };
    if (!drag) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = drag;
    setDragging(true);
    if (editing) setTab(drag.kind === "title" ? "title" : "text");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toCanvas(event);
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    const { origin } = drag;
    drag.live = drag.kind === "title" ? { ...origin, title: { x: origin.title.x + dx, y: origin.title.y + dy } }
      : drag.kind === "frame" ? { ...origin, frame: clampFrame({ ...origin.frame, left: origin.frame.left + dx, top: origin.frame.top + dy }) }
        : { ...origin, frame: resize(origin.frame, drag.handle, dx, dy) };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => { const result = draw(drag.live); if (result) setShownCount(result.count); });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag) return;
    const title = hitRef.current?.title;
    // Վերնագիրը պահում ենք այնտեղ, որտեղ իրականում նկարվեց (ազատ գոտու մեջ)։
    setLayout(drag.kind === "title" && title ? { ...drag.live, title: { x: title.left + title.width / 2, y: title.top } } : drag.live);
  };

  const resetPlaces = () => { if (layout) setLayout(defaultLayout(background, style)); };

  const say = (value: string) => {
    setNotice(value);
    window.setTimeout(() => setNotice((current) => (current === value ? "" : current)), 3_500);
  };

  const shareFiles = async () => {
    const files = filesRef.current;
    if (!files) return;
    if (!(await systemShare({ files }))) {
      files.forEach((file) => download(file, file.name));
      say("Նկարները պահվեցին");
    }
  };

  const saveFiles = () => {
    const files = filesRef.current;
    if (!files) return;
    files.forEach((file) => download(file, file.name));
    say(files.length > 1 ? `${files.length} նկար պահվեց` : "Նկարը պահվեց");
  };

  // Mini App. Telegram-ը ընդունում է միայն հղում, դրա համար նկարը նախ բեռնվում է կայք։
  const uploadPage = async (index: number) => {
    const file = filesRef.current?.[index];
    if (!file) return null;
    const response = await fetch("/api/story-image", { method: "POST", headers: { "content-type": "image/jpeg" }, body: file, credentials: "same-origin" }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => null) as { url?: string | null } | null : null;
    return data?.url ?? null;
  };

  const telegramStory = async () => {
    if (!telegram?.shareToStory || busy) return;
    setBusy(true);
    const url = await uploadPage(page);
    setBusy(false);
    if (!url) { say("Չստացվեց. փորձեք կրկին"); return; }
    telegram.shareToStory(url, { text: `${source.title} — apostolic.am${source.path}` });
  };

  const telegramSave = async () => {
    if (!telegram?.downloadFile || busy) return;
    setBusy(true);
    const urls: string[] = [];
    for (let index = 0; index < (filesRef.current?.length ?? 0); index += 1) {
      const url = await uploadPage(index);
      if (url) urls.push(url);
    }
    setBusy(false);
    if (!urls.length) { say("Չստացվեց. փորձեք կրկին"); return; }
    // Telegram-ը միանգամից մեկ ֆայլ է ներբեռնում. մնացածը՝ հաջորդաբար։
    const next = (index: number) => {
      if (index >= urls.length) return;
      telegram.downloadFile?.({ url: urls[index], file_name: fileName(source.path, index, urls.length) }, () => next(index + 1));
    };
    next(0);
  };

  const toggleUnit = (index: number) => {
    // Առաջին նշումից ցանկը դառնում է «իմ ընտրածը»՝ սկսած հիմա երևացողից։
    const start = textMode === "custom" ? custom : textMode === "all" ? range(units.length) : range(shownCount);
    const next = new Set(start);
    if (next.has(index)) { if (next.size > 1) next.delete(index); } else next.add(index);
    setCustom(next);
    setTextMode("custom");
  };

  const chosenNow = textMode === "custom" ? custom : textMode === "all" ? range(units.length) : range(shownCount);
  const action = "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[15px] border-0 px-3 text-[14px] font-bold disabled:cursor-default disabled:opacity-50";
  const primary = `${action} bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708] shadow-card`;
  const secondary = "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[14px] border border-glass-border bg-subtle px-2 text-[13px] font-bold text-ink disabled:cursor-default disabled:opacity-50";
  const disabled = !ready || tooLong || busy;
  const chip = (on: boolean) => `inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-[12px] font-bold ${on ? "border-[#d9b56f] bg-[rgb(217_181_111/20%)] text-ink" : "border-glass-border bg-subtle text-ink"}`;
  const shareLabel = pageCount > 1 ? `Կիսվել (${pageCount} նկար)` : "Կիսվել նկարով";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-[var(--page-bg)] pt-[var(--tg-inset-top,0px)] pb-[var(--tg-inset-bottom,0px)]" role="dialog" aria-modal="true" aria-label="Կիսվել">
      <header className="flex items-center justify-between gap-2 border-b border-glass-border px-4 py-2">
        <strong className="font-noto text-[16px] text-ink">{editing ? "Կարգավորել նկարը" : "Կիսվել"}</strong>
        <button className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-subtle text-ink" type="button" aria-label="Փակել" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>

      <div className={`flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-center min-[760px]:gap-6 ${dragging ? "overflow-hidden" : "overflow-y-auto"}`}>
        {/* Կարգավորելիս նախադիտումը մնում է վերևում, որ փոփոխությունները միանգամից երևան։ */}
        <div className={`grid shrink-0 justify-items-center gap-1.5 min-[760px]:sticky min-[760px]:top-0 ${editing ? "sticky -top-3 z-10 -mx-4 bg-[var(--page-bg)] px-4 pt-3 pb-2 shadow-[0_10px_16px_-12px_rgb(0_0_0/40%)] min-[760px]:static min-[760px]:shadow-none" : ""}`}>
          <div className="relative">
            <canvas ref={previewRef} width={STORY_WIDTH} height={STORY_HEIGHT}
              className={`block w-auto touch-none select-none rounded-[18px] shadow-[0_14px_40px_rgb(20_8_24/35%)] ${editing ? "h-[min(40svh,520px)]" : "h-[min(62svh,640px)]"} min-[760px]:h-[min(78svh,680px)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              aria-label="Նկարի նախադիտում. քաշեք վերնագիրը կամ տեքստը, տեքստի շրջանակի կետերով փոխեք չափը"
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            {pageCount > 1 ? (
              <>
                <button className="absolute left-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page === 0} aria-label="Նախորդ նկարը" onClick={() => setPage(page - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page >= pageCount - 1} aria-label="Հաջորդ նկարը" onClick={() => setPage(page + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
              </>
            ) : null}
          </div>
          {tooLong ? (
            <p className="m-0 max-w-[340px] text-center text-[12.5px] font-semibold text-[#b3402f]">Ընտրված տեքստը շատ երկար է. «Տեքստ»-ում ընտրեք ավելի քիչ հատված։</p>
          ) : pageCount > 1 ? (
            <p className="m-0 max-w-[340px] text-center text-[12.5px] text-muted">Կլինի <b className="text-ink">{pageCount} նկար</b>։ Մեկ նկարի համար՝ {editing ? "" : "«Կարգավորել» → "}«Տեքստ» → «Ըստ շրջանակի»։</p>
          ) : (
            <p className="m-0 text-center text-[11.5px] text-muted">{editing && tab === "text" ? "Կետերով լայնացրեք կամ նեղացրեք տեքստի շրջանակը" : "Քաշեք վերնագիրը կամ տեքստը՝ տեղը փոխելու համար"}</p>
          )}
        </div>

        {editing ? (
          <div className="grid w-full max-w-[440px] gap-3.5 self-center pb-2 min-[760px]:self-start">
            <Segmented value={tab} options={TABS} onChange={setTab} />

            {tab === "background" ? (
              <>
                <Row label="Ֆոն">
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {STORY_DESIGNS.map((entry) => (
                      <button key={entry.id} type="button" aria-label={entry.label} title={entry.label} aria-pressed={entry.id === design}
                        className={`h-[84px] w-[48px] shrink-0 cursor-pointer rounded-[10px] border-2 bg-cover bg-center p-0 ${entry.id === design ? "border-[#d9b56f] shadow-[0_0_0_2px_rgb(217_181_111/35%)]" : "border-transparent"}`}
                        style={{ backgroundImage: `url(${storyBackground(entry.id, tone).thumb})` }}
                        onClick={() => setDesign(entry.id)} />
                    ))}
                  </div>
                </Row>
                <Segmented label="Ֆոնի տոն" value={tone} options={TONES} onChange={setTone} />
                <button className={`${secondary} flex-none`} type="button" onClick={resetPlaces}><RotateCcw size={16} aria-hidden="true" /> Վերադարձնել տեղերը</button>
              </>
            ) : null}

            {tab === "title" ? (
              <>
                <Segmented label="Վերնագիր" value={style.title.show} options={[[true, "Ցույց տալ"], [false, "Թաքցնել"]]} onChange={(show) => setPart("title", { show })} />
                {style.title.show ? (
                  <>
                    <SizeControl value={style.title.size} min={TITLE_SIZES.min} max={TITLE_SIZES.max} onChange={(size) => setPart("title", { size })} />
                    <ColorControl value={style.title.color} recent={recent} onChange={(color) => chooseColor("title", color)} />
                    <Segmented label="Տառատեսակ" value={style.title.font} options={FONTS} onChange={(font) => setPart("title", { font })} />
                    <Segmented label="Շերտ վերնագրի տակ" value={style.title.shade} options={SHADES} onChange={(shade) => setPart("title", { shade })} />
                  </>
                ) : null}
              </>
            ) : null}

            {tab === "text" ? (
              <>
                <Row label="Որքան տեքստ" aside={<span className="text-[11.5px] text-muted">{chosenNow.size} / {units.length} հատված</span>}>
                  <div className="flex flex-wrap gap-1.5">
                    <button className={chip(textMode === "fit")} type="button" onClick={() => setTextMode("fit")}>Ըստ շրջանակի</button>
                    <button className={chip(textMode === "all")} type="button" onClick={() => setTextMode("all")}>Ամբողջը</button>
                    {units.length > 1 ? <button className={chip(picking)} type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "Փակել ցանկը" : "Ընտրել հատվածները"}</button> : null}
                  </div>
                  {textMode === "fit" ? <p className="m-0 text-[11.5px] text-muted">Որքան մեծ է շրջանակը, այնքան շատ տեքստ է տեղավորվում. մնացածի տեղում՝ «…»։</p> : null}
                  {picking ? (
                    <ul className="m-0 grid max-h-[240px] list-none gap-1 overflow-y-auto rounded-[13px] border border-glass-border bg-subtle p-1.5">
                      {units.map((unit, index) => {
                        const on = chosenNow.has(index);
                        return (
                          <li key={index}>
                            <button type="button" aria-pressed={on} onClick={() => toggleUnit(index)}
                              className={`flex w-full cursor-pointer items-start gap-2 rounded-[10px] border-0 p-2 text-left text-[12.5px] leading-snug ${on ? "bg-[rgb(217_181_111/18%)] text-ink" : "bg-transparent text-muted"}`}>
                              <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border ${on ? "border-[#b07d2e] bg-[#d9b56f] text-[#2a1708]" : "border-glass-border"}`}>{on ? <Check size={12} aria-hidden="true" /> : null}</span>
                              <span className="line-clamp-2">{unit.text}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Row>
                <SizeControl value={style.text.size} min={TEXT_SIZES.min} max={TEXT_SIZES.max} onChange={(size) => setPart("text", { size })} />
                <ColorControl value={style.text.color} recent={recent} onChange={(color) => chooseColor("text", color)} />
                <Segmented label="Տառատեսակ" value={style.text.font} options={FONTS} onChange={(font) => setPart("text", { font })} />
                <Segmented label="Հավասարեցում" value={style.text.align} options={ALIGNS} onChange={(align) => setPart("text", { align })} />
                <Segmented label="Շերտ տեքստի տակ" value={style.text.shade} options={SHADES} onChange={(shade) => setPart("text", { shade })} />
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="grid gap-2 border-t border-glass-border px-4 pt-3 pb-3">
        {notice ? <p className="m-0 text-center text-[12.5px] font-semibold text-gold-bright" role="status">{notice}</p> : null}
        <div className="mx-auto grid w-full max-w-[520px] gap-2">
          {canStory ? (
            <button className={primary} type="button" disabled={disabled} onClick={telegramStory}><Send size={18} aria-hidden="true" /> {pageCount > 1 ? `Telegram story (${page + 1}/${pageCount})` : "Telegram story"}</button>
          ) : canShareFiles ? (
            <button className={primary} type="button" disabled={disabled} onClick={shareFiles}><Share2 size={18} aria-hidden="true" /> {shareLabel}</button>
          ) : (
            <button className={primary} type="button" disabled={disabled} onClick={canDownloadInTelegram ? telegramSave : saveFiles}><Download size={18} aria-hidden="true" /> Պահել նկար{pageCount > 1 ? "ները" : "ը"}</button>
          )}
          <div className="flex gap-2">
            <button className={secondary} type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
              {editing ? <><Check size={16} aria-hidden="true" /> Պատրաստ է</> : <><SlidersHorizontal size={16} aria-hidden="true" /> Կարգավորել</>}
            </button>
            {canStory && canShareFiles ? <button className={secondary} type="button" disabled={disabled} onClick={shareFiles}><Share2 size={16} aria-hidden="true" /> Կիսվել</button>
              : canStory && canDownloadInTelegram ? <button className={secondary} type="button" disabled={disabled} onClick={telegramSave}><Download size={16} aria-hidden="true" /> Պահել</button>
                : canShareFiles ? <button className={secondary} type="button" disabled={disabled} onClick={saveFiles}><Download size={16} aria-hidden="true" /> Պահել</button> : null}
            <button className={secondary} type="button" onClick={() => { onClose(); onLink(); }}><Link2 size={16} aria-hidden="true" /> Հղումով</button>
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
