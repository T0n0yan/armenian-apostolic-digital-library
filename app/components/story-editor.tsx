import { Check, ChevronLeft, ChevronRight, Download, Image as ImageIcon, Link2, Minus, Plus, RotateCcw, Send, Share2, SlidersHorizontal, Type, Heading, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../utils/scroll-lock";
import { STORY_DESIGNS, storyBackground, type StoryTone } from "../utils/story-backgrounds";
import { STORY_HEIGHT, STORY_WIDTH, fitCount, joinUnits, storyUnits, type StoryAlign } from "../utils/story-layout";
import {
  TEXT_SIZES, TITLE_SIZES, canvasBlob, clampFrame, defaultLayout, drawStoryPage, frameHandles, loadBackground,
  loadStoryFonts, measureBrightness, normalizeStyle, planFor,
  type Brightness, type Handle, type PartStyle, type Rect, type StoryEffect, type StoryFont, type StoryGuides, type StoryHit,
  type StoryLayout, type StoryPlanWithCap, type StoryStyle,
} from "../utils/story-render";
import { StoryColorPicker } from "./story-color-picker";
import { systemShare } from "./share-button";

/** `ornate`՝ աղոթք է. առաջին տառը կարելի է թռչնագրով նկարել։ */
export type StorySource = { title: string; text: string; path: string; ornate?: boolean };

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

const SETTINGS_KEY = "story-style-v5";
const COLORS_KEY = "story-colors";
type Saved = { style?: Partial<StoryStyle>; design?: string; tone?: StoryTone };

function readJson<T>(key: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Պահելը պարտադիր չէ։ */ }
}

const ALIGNS: Array<[StoryAlign, string]> = [["center", "Մեջտեղում"], ["start", "Ձախից"]];
const FONTS: Array<[StoryFont, string]> = [["book", "Գրքային"], ["serif", "Նոտո"]];
const EFFECTS: Array<[StoryEffect, string]> = [["none", "Չկա"], ["shadow", "Ստվեր"], ["glow", "Լույս"], ["gold", "Ոսկեզօծ"]];
const STRENGTH_LABEL: Record<StoryEffect, string> = { none: "", shadow: "Ստվերի ուժգնություն", glow: "Լույսի ուժգնություն", gold: "Փայլի ուժգնություն" };
const TONES: Array<[StoryTone, string]> = [["dark", "Մուգ"], ["light", "Բաց"]];
type Tab = "background" | "title" | "text";
type TextMode = "fit" | "all" | "custom";
/** Մեջտեղին այսքան մոտ՝ կպչում է (նկարի պիքսելներով)։ */
const SNAP = 26;

function Segmented<T extends string | number | boolean>({ label, value, options, onChange }: {
  label?: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      {label ? <span className="text-[11.5px] font-bold tracking-[0.02em] text-muted">{label}</span> : null}
      <div className="flex gap-1 rounded-control bg-[rgb(127_127_127/12%)] p-[3px]" role="radiogroup" aria-label={label}>
        {options.map(([option, text]) => (
          <button key={String(option)} type="button" role="radio" aria-checked={option === value}
            className={`min-h-8 flex-1 cursor-pointer rounded-chip border-0 px-1 text-[12.5px] font-bold transition-colors ${option === value ? "bg-[var(--page-bg)] text-gold-bright shadow-[0_1px_4px_rgb(0_0_0/18%)]" : "bg-transparent text-muted"}`}
            onClick={() => onChange(option)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold tracking-[0.02em] text-muted">{label}</span>
        {value ? <span className="text-[12px] font-bold text-ink tabular-nums">{value}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Սահիչ՝ −/+ կոճակներով (չափ, շերտի ուժ)։ */
function Slider({ label, value, min, max, step = 1, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; format: (value: number) => string; onChange: (value: number) => void;
}) {
  const button = "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(127_127_127/14%)] text-ink disabled:opacity-35";
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
  return (
    <Field label={label} value={format(value)}>
      <div className="flex items-center gap-2.5">
        <button className={button} type="button" aria-label={`${label}՝ պակասեցնել`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}><Minus size={15} aria-hidden="true" /></button>
        <input className="story-range min-w-0 flex-1" type="range" min={min} max={max} step={step} value={value} aria-label={label}
          style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
          onChange={(event) => onChange(Number(event.target.value))} />
        <button className={button} type="button" aria-label={`${label}՝ ավելացնել`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}><Plus size={15} aria-hidden="true" /></button>
      </div>
    </Field>
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

type Drag = { kind: "title" | "frame" | "resize"; handle?: Handle; x: number; y: number; origin: StoryLayout; live: StoryLayout; guides: StoryGuides };

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

/** Մեջտեղին մոտ լինելիս՝ կպցնում է. վերադարձնում է նոր դիրքը և արդյոք կպավ։ */
function snap(center: number, target: number) {
  return Math.abs(center - target) < SNAP ? { shift: target - center, on: true } : { shift: 0, on: false };
}

/**
 * Աղոթքը, սաղմոսը կամ համարը՝ story-ի նկար (1080×1920)։ Բացվելիս միանգամից ցույց է տալիս
 * պատրաստի նկարը։ «Կարգավորել»-ում՝ Ֆոն, Վերնագիր, Տեքստ. ամեն մեկն իր չափով, գույնով, էֆեկտով
 * (ոսկի, լույս, ստվեր) և տակի շերտով։ Տեքստի շրջանակը քաշվում և լայնացվում է մատով, կպչում է
 * մեջտեղին, և դրանից է կախված, թե որքան տեքստ է տեղավորվում։ apostolic.am-ը միշտ բաց է մնում։
 */
export function StoryEditor({ source, onClose, onLink }: { source: StorySource; onClose: () => void; onLink: () => void }) {
  useScrollLock(true);
  const saved = useMemo(() => readJson<Saved>(SETTINGS_KEY, {}), []);
  const [design, setDesign] = useState(() => saved.design ?? STORY_DESIGNS[0].id);
  const [tone, setTone] = useState<StoryTone>(() => saved.tone ?? "dark");
  const background = useMemo(() => storyBackground(design, tone), [design, tone]);
  const [style, setStyle] = useState<StoryStyle>(() => normalizeStyle(saved.style));
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
  // Նախադիտումը 9:16 է և լրիվ տեղավորվում է մնացած տեղում (ոչ կտրված, ոչ ձգված)։
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ width: number; height: number } | null>(null);
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
  const ornate = Boolean(source.ornate);

  useEffect(() => { writeJson(SETTINGS_KEY, { style, design, tone }); }, [design, style, tone]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const fitted = Math.min(width, (height * STORY_WIDTH) / STORY_HEIGHT);
      setFit({ width: Math.floor(fitted), height: Math.floor((fitted * STORY_HEIGHT) / STORY_WIDTH) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const setPart = useCallback(<K extends "title" | "text">(part: K, patch: Partial<StoryStyle[K]>) =>
    setStyle((current) => ({ ...current, [part]: { ...current[part], ...patch } })), []);

  // Ընտրված գույնը (երբ ընտրությունը կանգ է առնում) ավելանում է «վերջինների» մեջ։
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const picked = [style.text.color, style.title.color].filter((color) => color !== "auto");
      if (!picked.length) return;
      setRecent((current) => {
        const next = [...picked, ...current.filter((entry) => !picked.includes(entry))].slice(0, 6);
        if (next.join() === current.join()) return current;
        writeJson(COLORS_KEY, next);
        return next;
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [style.text.color, style.title.color]);

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

  /** Պլանը տրված դասավորությամբ. սկզբում («fit»)՝ այնքան, որքան տեղավորվում է շրջանակում։ */
  const computePlan = useCallback((current: StoryLayout): { plan: StoryPlanWithCap; count: number } | null => {
    const context = measureRef.current;
    if (!context) return null;
    const plan = (set: Set<number>) => planFor(context, joinUnits(units, set), style, current.frame, ornate);
    if (textMode === "all") return { plan: plan(range(units.length)), count: units.length };
    if (textMode === "custom") return { plan: plan(custom), count: custom.size };
    const count = fitCount(units.length, (value) => plan(range(value)).pages.length === 1);
    return { plan: plan(range(count)), count };
  }, [custom, ornate, style, textMode, units]);

  const draw = useCallback((current: StoryLayout, guides: StoryGuides | null = null) => {
    const context = previewRef.current?.getContext("2d");
    const result = computePlan(current);
    if (!context || !result) return null;
    hitRef.current = drawStoryPage(context, {
      background, image: imageRef.current, brightness: brightnessRef.current, style, layout: current, plan: result.plan,
      page: Math.min(page, result.plan.pages.length - 1), title: source.title,
      outline: editing ? (tab === "background" ? null : tab) : undefined, guides,
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
    // Փոքր նախադիտման վրա մատը կոպիտ է. կետերը «բռնվում» են լայն շառավղով (~22 px էկրանին)։
    const reach = Math.max(70, (22 * STORY_WIDTH) / Math.max(event.currentTarget.getBoundingClientRect().width, 1));
    const handle = editing && tab === "text"
      ? frameHandles(layout.frame).find(([hx, hy]) => Math.hypot(point.x - hx, point.y - hy) < reach)?.[2]
      : undefined;
    const base = { x: point.x, y: point.y, origin: layout, live: layout, guides: { x: false, y: false } };
    let drag: Drag | null = null;
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
    if (drag.kind === "title") {
      const x = snap(origin.title.x + dx, STORY_WIDTH / 2);
      drag.live = { ...origin, title: { x: origin.title.x + dx + x.shift, y: origin.title.y + dy } };
      drag.guides = { x: x.on, y: false };
    } else if (drag.kind === "frame") {
      const moved = clampFrame({ ...origin.frame, left: origin.frame.left + dx, top: origin.frame.top + dy });
      const x = snap(moved.left + moved.width / 2, STORY_WIDTH / 2);
      const y = snap(moved.top + moved.height / 2, STORY_HEIGHT / 2);
      drag.live = { ...origin, frame: clampFrame({ ...moved, left: moved.left + x.shift, top: moved.top + y.shift }) };
      drag.guides = { x: x.on, y: y.on };
    } else if (drag.handle) {
      drag.live = { ...origin, frame: resize(origin.frame, drag.handle, dx, dy) };
      const center = drag.live.frame.left + drag.live.frame.width / 2;
      drag.guides = { x: Math.abs(center - STORY_WIDTH / 2) < 2, y: false };
    }
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => { const result = draw(drag.live, drag.guides); if (result) setShownCount(result.count); });
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

  /** Շրջանակը և վերնագիրը՝ ուղիղ մեջտեղում։ */
  const centerAll = () => {
    if (!layout) return;
    setLayout({ title: { ...layout.title, x: STORY_WIDTH / 2 }, frame: clampFrame({ ...layout.frame, left: (STORY_WIDTH - layout.frame.width) / 2 }) });
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
  const disabled = !ready || tooLong || busy;
  const primary = "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 bg-[linear-gradient(135deg,#ecd08f,#b9852f)] px-5 text-[14.5px] font-bold text-[#2a1708] shadow-[0_8px_22px_rgb(176_125_46/35%)] disabled:cursor-default disabled:opacity-50";
  const ghost = "inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-glass-border bg-subtle px-4 text-[13px] font-bold text-ink disabled:cursor-default disabled:opacity-50";
  const chip = (on: boolean) => `inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-[12px] font-bold ${on ? "border-[#d9b56f] bg-[rgb(217_181_111/20%)] text-ink" : "border-glass-border bg-transparent text-muted"}`;
  const tabButton = (on: boolean) => `flex min-h-12 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border-0 text-[11px] font-bold transition-colors ${on ? "bg-[rgb(217_181_111/16%)] text-gold-bright" : "bg-transparent text-muted"}`;
  const primaryAction = canStory
    ? <button className={primary} type="button" disabled={disabled} onClick={telegramStory}><Send size={18} aria-hidden="true" /> {pageCount > 1 ? `Story (${page + 1}/${pageCount})` : "Telegram story"}</button>
    : canShareFiles
      ? <button className={primary} type="button" disabled={disabled} onClick={shareFiles}><Share2 size={18} aria-hidden="true" /> Կիսվել նկարով{pageCount > 1 ? ` · ${pageCount}` : ""}</button>
      : <button className={primary} type="button" disabled={disabled} onClick={canDownloadInTelegram ? telegramSave : saveFiles}><Download size={18} aria-hidden="true" /> Պահել նկար{pageCount > 1 ? "ները" : "ը"}</button>;
  // Ներբեռնելը (վերևի պատկերակը). Mini App-ում՝ Telegram-ի միջոցով։
  const saveAction = canDownloadInTelegram ? telegramSave : saveFiles;

  const partControls = (part: "title" | "text") => {
    const value: PartStyle = style[part];
    const sizes = part === "title" ? TITLE_SIZES : TEXT_SIZES;
    return (
      <>
        <Slider label="Տառի չափ" value={value.size} min={sizes.min} max={sizes.max} format={(size) => `${size} px`} onChange={(size) => setPart(part, { size })} />
        <Segmented label="Էֆեկտ" value={value.effect} options={EFFECTS} onChange={(effect) => setPart(part, { effect })} />
        {value.effect !== "none" ? (
          <Slider label={STRENGTH_LABEL[value.effect]} value={Math.round(value.strength * 100)} min={0} max={100} step={5}
            format={(strength) => `${strength}%`} onChange={(strength) => setPart(part, { strength: strength / 100 })} />
        ) : null}
        <Field label="Գույն" value={value.effect === "gold" ? <span className="font-semibold text-muted">«Ոսկեզօծ»-ն ունի իր գույնը</span> : undefined}>
          <StoryColorPicker value={value.color} recent={recent} disabled={value.effect === "gold"} onChange={(color) => setPart(part, { color })} />
        </Field>
        <Segmented label="Տառատեսակ" value={value.font} options={FONTS} onChange={(font) => setPart(part, { font })} />
        <Slider label={part === "title" ? "Շերտ վերնագրի տակ" : "Շերտ տեքստի տակ"} value={Math.round(value.shade * 100)} min={0} max={100} step={5}
          format={(shade) => (shade ? `${shade}%` : "Չկա")} onChange={(shade) => setPart(part, { shade: shade / 100 })} />
      </>
    );
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-[var(--page-bg)] pt-[var(--tg-inset-top,0px)] pb-[var(--tg-inset-bottom,0px)]" role="dialog" aria-modal="true" aria-label="Կիսվել նկարով">
      <header className="flex items-center gap-2 px-3 py-2">
        <button className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-subtle text-ink" type="button" aria-label="Փակել" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        <strong className="flex-1 text-center font-noto text-[15.5px] text-ink">{editing ? "Ձևավորել" : "Կիսվել նկարով"}</strong>
        {/* Ձևավորելիս «Պատրաստ է»-ն վերևում է, որ նկարի վրա ոչինչ չծածկի։ */}
        {editing ? (
          <button className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[linear-gradient(135deg,#ecd08f,#b9852f)] px-3.5 text-[13px] font-bold text-[#2a1708]" type="button" onClick={() => setEditing(false)}>
            <Check size={16} aria-hidden="true" /> Պատրաստ է
          </button>
        ) : (
          <button className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-subtle text-ink disabled:opacity-40" type="button" disabled={disabled}
            aria-label={pageCount > 1 ? "Ներբեռնել նկարները" : "Ներբեռնել նկարը"} title="Ներբեռնել" onClick={saveAction}>
            <Download size={19} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col min-[860px]:flex-row min-[860px]:items-stretch min-[860px]:justify-center min-[860px]:gap-6 min-[860px]:px-6">
        {/* Նախադիտումը զբաղեցնում է մնացած ամբողջ տեղը։ */}
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 pb-2 min-[860px]:flex-none min-[860px]:py-4">
          <div ref={stageRef} className="flex h-full max-h-[720px] min-h-0 w-full items-center justify-center">
          <div className="relative" style={fit ? { width: fit.width, height: fit.height } : { height: "100%" }}>
            <canvas ref={previewRef} width={STORY_WIDTH} height={STORY_HEIGHT}
              className={`block h-full w-full touch-none select-none rounded-card shadow-[0_18px_50px_rgb(20_8_24/40%)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              aria-label="Նկարի նախադիտում. քաշեք վերնագիրը կամ տեքստը, տեքստի շրջանակի կետերով փոխեք չափը"
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            {/* «Ձևավորել»-ը նկարի վրա է միայն դիտելիս. ձևավորելիս նկարը ամբողջությամբ ազատ է։ */}
            {editing ? null : (
              <button className="absolute right-2.5 top-2.5 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[rgb(20_12_24/55%)] px-3 text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgb(0_0_0/30%)] backdrop-blur-md"
                type="button" onClick={() => setEditing(true)}>
                <SlidersHorizontal size={16} aria-hidden="true" /> Ձևավորել
              </button>
            )}
            {pageCount > 1 ? (
              <>
                <button className="absolute -left-3 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--page-bg)] text-ink shadow-card disabled:opacity-0" type="button" disabled={page === 0} aria-label="Նախորդ նկարը" onClick={() => setPage(page - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button className="absolute -right-3 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--page-bg)] text-ink shadow-card disabled:opacity-0" type="button" disabled={page >= pageCount - 1} aria-label="Հաջորդ նկարը" onClick={() => setPage(page + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
                <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
                  {Array.from({ length: pageCount }, (_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === page ? "w-5 bg-white" : "w-1.5 bg-white/50"}`} />)}
                </span>
              </>
            ) : null}
          </div>
          </div>
          {tooLong ? <p className="m-0 max-w-[360px] text-center text-[11.5px] font-semibold leading-snug text-[#c2513f]" role="status">Տեքստը շատ երկար է. «Տեքստ»-ում ընտրեք ավելի քիչ հատված։</p> : null}
        </div>

        {editing ? (
          <section className="story-panel flex max-h-[46svh] min-h-0 flex-col rounded-t-card border-t border-glass-border bg-[var(--page-bg)] shadow-[0_-12px_30px_rgb(0_0_0/22%)] min-[860px]:my-4 min-[860px]:max-h-none min-[860px]:w-[400px] min-[860px]:rounded-card min-[860px]:border">
            <nav className="grid grid-cols-3 gap-1 p-2 pb-1" aria-label="Ձևավորման բաժիններ">
              <button className={tabButton(tab === "background")} type="button" aria-pressed={tab === "background"} onClick={() => setTab("background")}><ImageIcon size={18} aria-hidden="true" />Ֆոն</button>
              <button className={tabButton(tab === "title")} type="button" aria-pressed={tab === "title"} onClick={() => setTab("title")}><Heading size={18} aria-hidden="true" />Վերնագիր</button>
              <button className={tabButton(tab === "text")} type="button" aria-pressed={tab === "text"} onClick={() => setTab("text")}><Type size={18} aria-hidden="true" />Տեքստ</button>
            </nav>
            <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pt-2 pb-4">
              {tab === "background" ? (
                <>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
                    {STORY_DESIGNS.map((entry) => (
                      <button key={entry.id} type="button" aria-label={entry.label} title={entry.label} aria-pressed={entry.id === design}
                        className={`grid shrink-0 cursor-pointer justify-items-center gap-1 border-0 bg-transparent p-0 text-[10.5px] font-bold ${entry.id === design ? "text-gold-bright" : "text-muted"}`}
                        onClick={() => setDesign(entry.id)}>
                        <span className={`block h-[92px] w-[52px] rounded-control bg-cover bg-center ring-2 transition ${entry.id === design ? "ring-[#d9b56f]" : "ring-transparent"}`}
                          style={{ backgroundImage: `url(${storyBackground(entry.id, tone).thumb})` }} />
                        {entry.label}
                      </button>
                    ))}
                  </div>
                  <Segmented label="Տոն" value={tone} options={TONES} onChange={setTone} />
                  <div className="flex gap-2">
                    <button className={`${ghost} min-h-10 flex-1`} type="button" onClick={centerAll}>Մեջտեղում դնել</button>
                    <button className={`${ghost} min-h-10 flex-1`} type="button" onClick={resetPlaces}><RotateCcw size={15} aria-hidden="true" /> Սկզբնական</button>
                  </div>
                </>
              ) : null}

              {tab === "title" ? (
                <>
                  <Segmented label="Վերնագիր" value={style.title.show} options={[[true, "Ցույց տալ"], [false, "Թաքցնել"]]} onChange={(show) => setPart("title", { show })} />
                  {style.title.show ? partControls("title") : null}
                </>
              ) : null}

              {tab === "text" ? (
                <>
                  <Field label="Որքան տեքստ" value={<span className="font-semibold text-muted">{chosenNow.size} / {units.length}</span>}>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Սկզբում (և երբ ոչինչ ընտրված չէ)՝ այնքան, որքան տեղավորվում է շրջանակում։ «Ամբողջը»-ն
                          կրկին սեղմելիս վերադառնում է դրան։ */}
                      <button className={chip(textMode === "all")} type="button" aria-pressed={textMode === "all"} onClick={() => setTextMode(textMode === "all" ? "fit" : "all")}>Ամբողջը</button>
                      {units.length > 1 ? <button className={chip(picking || textMode === "custom")} type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>Ընտրել…</button> : null}
                    </div>
                    {picking ? (
                      <ul className="m-0 grid max-h-[200px] list-none gap-1 overflow-y-auto rounded-control bg-[rgb(127_127_127/10%)] p-1.5">
                        {units.map((unit, index) => {
                          const on = chosenNow.has(index);
                          return (
                            <li key={index}>
                              <button type="button" aria-pressed={on} onClick={() => toggleUnit(index)}
                                className={`flex w-full cursor-pointer items-start gap-2 rounded-control border-0 p-2 text-left text-[12.5px] leading-snug ${on ? "bg-[rgb(217_181_111/16%)] text-ink" : "bg-transparent text-muted"}`}>
                                <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-chip border ${on ? "border-[#b07d2e] bg-[#d9b56f] text-[#2a1708]" : "border-glass-border"}`}>{on ? <Check size={12} aria-hidden="true" /> : null}</span>
                                <span className="line-clamp-2">{unit.text}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </Field>
                  {ornate ? <Segmented label="Թռչնատառ (առաջին տառը)" value={style.text.ornate} options={[[true, "Միացված"], [false, "Անջատված"]]} onChange={(value) => setPart("text", { ornate: value })} /> : null}
                  {partControls("text")}
                  <Segmented label="Հավասարեցում" value={style.text.align} options={ALIGNS} onChange={(align) => setPart("text", { align })} />
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="flex flex-col gap-2 px-4 pt-2 pb-3">
        {notice ? <p className="m-0 text-center text-[12.5px] font-semibold text-gold-bright" role="status">{notice}</p> : null}
        <div className="mx-auto flex w-full max-w-[520px] gap-2">
          {primaryAction}
          <button className={`${ghost} flex-1`} type="button" onClick={() => { onClose(); onLink(); }}><Link2 size={17} aria-hidden="true" /> Կիսվել հղումով</button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
