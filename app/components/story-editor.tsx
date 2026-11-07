import { Check, ChevronLeft, ChevronRight, Download, Link2, RotateCcw, Send, Share2, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../utils/scroll-lock";
import { STORY_DESIGNS, storyBackground, type StoryTone } from "../utils/story-backgrounds";
import { STORY_HEIGHT, STORY_WIDTH, joinUnits, storyUnits, type StoryAlign, type StoryPlan, type StorySize } from "../utils/story-layout";
import {
  STORY_SWATCHES, canvasBlob, drawStoryPage, loadBackground, loadStoryFonts, measureBrightness, planFor, storyRects,
  type Brightness, type Offset, type Rect, type StoryFont, type StoryShade, type StoryStyle,
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

const SETTINGS_KEY = "story-style-v2";
type Saved = Partial<StoryStyle> & { design?: string; tone?: StoryTone };

function readSaved(): Saved {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Saved; } catch { return {}; }
}
function writeSaved(value: Saved) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* Պահելը պարտադիր չէ։ */ }
}

const SIZES: Array<[StorySize, string]> = [["auto", "Ավտո"], ["sm", "Փոքր"], ["md", "Միջին"], ["lg", "Մեծ"], ["xl", "Շատ մեծ"]];
const ALIGNS: Array<[StoryAlign, string]> = [["center", "Մեջտեղում"], ["start", "Ձախից"]];
const FONTS: Array<[StoryFont, string]> = [["book", "Գրքային"], ["serif", "Նոտո"]];
const SHADES: Array<[StoryShade, string]> = [[0, "Չկա"], [1, "Թեթև"], [2, "Խիտ"]];
const TONES: Array<[StoryTone, string]> = [["dark", "Մուգ"], ["light", "Բաց"]];
const ZERO: Offset = { x: 0, y: 0 };

function Segmented<T extends string | number | boolean>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-bold text-muted">{label}</span>
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

function measureContext() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  return canvas.getContext("2d");
}

/**
 * Աղոթքը, սաղմոսը կամ համարը՝ story-ի նկար (1080×1920)։ Բացվելիս միանգամից ցույց է տալիս
 * պատրաստի նկարը. «Կարգավորել»-ով ընթերցողը ընտրում է ֆոնը, տեքստի մասը, տառի չափը, գույնը, իսկ
 * վերնագիրն ու տեքստը քաշում է մատով։ apostolic.am-ը միշտ բաց է մնում։ Հեռախոսում նկարները գնում
 * են համակարգի «Կիսվել» պատուհան (Instagram, Facebook, Telegram story), Mini App-ում՝ Telegram story։
 */
export function StoryEditor({ source, onClose, onLink }: { source: StorySource; onClose: () => void; onLink: () => void }) {
  useScrollLock(true);
  const saved = useMemo(readSaved, []);
  const [design, setDesign] = useState(() => saved.design ?? STORY_DESIGNS[0].id);
  const [tone, setTone] = useState<StoryTone>(() => saved.tone ?? "dark");
  const background = useMemo(() => storyBackground(design, tone), [design, tone]);
  const [style, setStyle] = useState<StoryStyle>(() => ({
    size: saved.size ?? "auto",
    align: saved.align ?? "center",
    color: saved.color ?? "auto",
    font: saved.font ?? "book",
    shade: saved.shade ?? 0,
    showTitle: saved.showTitle ?? true,
  }));
  const units = useMemo(() => storyUnits(source.text), [source.text]);
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const [textOffset, setTextOffset] = useState<Offset>(ZERO);
  const [titleOffset, setTitleOffset] = useState<Offset>(ZERO);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [tooLong, setTooLong] = useState(false);
  const [assets, setAssets] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const brightnessRef = useRef<Brightness | null>(null);
  const planRef = useRef<StoryPlan | null>(null);
  const rectsRef = useRef<{ text: Rect; title: Rect | null } | null>(null);
  const dragRef = useRef<{ part: "text" | "title"; x: number; y: number; origin: Offset; live: Offset } | null>(null);
  const frameRef = useRef(0);
  // Պատրաստի ֆայլերը՝ որ «Կիսվել»-ը անմիջապես բացի պատուհանը (iOS-ը սպասել չի թողնում)։
  const filesRef = useRef<File[] | null>(null);
  const telegram = typeof window === "undefined" ? null : telegramApp();
  const canStory = Boolean(telegram?.shareToStory && telegram.isVersionAtLeast?.("7.8"));
  const canDownloadInTelegram = Boolean(telegram?.downloadFile && telegram.isVersionAtLeast?.("8.0"));
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.jpg", { type: "image/jpeg" })] });

  useEffect(() => { writeSaved({ ...style, design, tone }); }, [design, style, tone]);
  const update = useCallback((patch: Partial<StoryStyle>) => setStyle((current) => ({ ...current, ...patch })), []);

  // Ֆոնը և տառատեսակները
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadStoryFonts();
      const image = await loadBackground(background.src);
      if (cancelled) return;
      imageRef.current = image;
      brightnessRef.current = measureBrightness(image);
      setAssets((value) => value + 1);
    })();
    return () => { cancelled = true; };
  }, [background.src]);

  /** Որքան հատված է տեղավորվում մեկ նկարում (սկզբից)։ */
  const fitOnePage = useCallback((current: StoryStyle) => {
    const context = measureContext();
    if (!context) return new Set(units.map((_, index) => index));
    let count = 1;
    for (let next = 1; next <= units.length; next += 1) {
      const set = new Set(Array.from({ length: next }, (_, index) => index));
      if (planFor(context, joinUnits(units, set), current, background).pages.length > 1) break;
      count = next;
    }
    return new Set(Array.from({ length: count }, (_, index) => index));
  }, [background, units]);

  // Առաջին անգամ՝ այնքան տեքստ, որքան տեղավորվում է մեկ նկարում։
  useEffect(() => {
    if (assets && !chosen) setChosen(fitOnePage(style));
  }, [assets, chosen, fitOnePage, style]);

  const text = useMemo(() => (chosen ? joinUnits(units, chosen) : ""), [chosen, units]);

  const drawPreview = useCallback((offsets?: { text: Offset; title: Offset }) => {
    const context = previewRef.current?.getContext("2d");
    const plan = planRef.current;
    if (!context || !plan) return;
    rectsRef.current = drawStoryPage(context, {
      background, image: imageRef.current, brightness: brightnessRef.current, style, plan,
      page: Math.min(page, plan.pages.length - 1), title: source.title,
      textOffset: offsets?.text ?? textOffset, titleOffset: offsets?.title ?? titleOffset, outline: editing,
    });
  }, [background, editing, page, source.title, style, textOffset, titleOffset]);

  // Պլանը և նախադիտումը
  useEffect(() => {
    if (!assets || !chosen) return;
    const context = measureContext();
    if (!context) return;
    const plan = planFor(context, text, style, background);
    planRef.current = plan;
    setPageCount(plan.pages.length);
    setTooLong(plan.tooLong);
    if (page > plan.pages.length - 1) setPage(plan.pages.length - 1);
    drawPreview();
  }, [assets, background, chosen, drawPreview, page, style, text]);

  // Պատրաստի ֆայլերը (փոփոխություններից կարճ ժամանակ անց)
  useEffect(() => {
    if (!assets || !chosen) return;
    let cancelled = false;
    filesRef.current = null;
    setReady(false);
    const timer = window.setTimeout(async () => {
      const plan = planRef.current;
      if (!plan || plan.tooLong) return;
      const work = document.createElement("canvas");
      work.width = STORY_WIDTH;
      work.height = STORY_HEIGHT;
      const context = work.getContext("2d");
      if (!context) return;
      const files: File[] = [];
      for (let index = 0; index < plan.pages.length; index += 1) {
        drawStoryPage(context, { background, image: imageRef.current, brightness: brightnessRef.current, style, plan, page: index, title: source.title, textOffset, titleOffset });
        const blob = await canvasBlob(work);
        if (cancelled || !blob) return;
        files.push(new File([blob], fileName(source.path, index, plan.pages.length), { type: "image/jpeg" }));
      }
      filesRef.current = files;
      setReady(true);
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [assets, background, chosen, source.path, source.title, style, text, textOffset, titleOffset]);

  // Քաշել մատով. վերնագիրը կամ տեքստը
  const toCanvas = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * STORY_WIDTH, y: ((event.clientY - box.top) / box.height) * STORY_HEIGHT };
  };
  const inside = (rect: Rect | null | undefined, point: { x: number; y: number }, pad = 36) =>
    Boolean(rect && point.x >= rect.left - pad && point.x <= rect.left + rect.width + pad && point.y >= rect.top - pad && point.y <= rect.top + rect.height + pad);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toCanvas(event);
    const part = inside(rectsRef.current?.title, point, 24) ? "title" : inside(rectsRef.current?.text, point) ? "text" : null;
    if (!part) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = part === "title" ? titleOffset : textOffset;
    dragRef.current = { part, x: point.x, y: point.y, origin, live: origin };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toCanvas(event);
    drag.live = { x: drag.origin.x + point.x - drag.x, y: drag.origin.y + point.y - drag.y };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => drawPreview(drag.part === "title" ? { text: textOffset, title: drag.live } : { text: drag.live, title: titleOffset }));
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    const plan = planRef.current;
    const rects = rectsRef.current;
    if (!drag || !plan || !rects) return;
    // Ազատ գոտուց դուրս չի գնում. պահում ենք այն տեղը, որտեղ իրականում նկարվեց։
    const base = storyRects(plan, style, background, ZERO, ZERO);
    if (drag.part === "title" && rects.title && base.title) setTitleOffset({ x: rects.title.left - base.title.left, y: rects.title.top - base.title.top });
    if (drag.part === "text") setTextOffset({ x: rects.text.left - base.text.left, y: rects.text.top - base.text.top });
  };

  const resetPlaces = () => { setTextOffset(ZERO); setTitleOffset(ZERO); };

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

  const toggleUnit = (index: number) => setChosen((current) => {
    const next = new Set(current ?? []);
    if (next.has(index)) { if (next.size > 1) next.delete(index); } else next.add(index);
    return next;
  });

  const action = "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[15px] border-0 px-3 text-[14px] font-bold disabled:cursor-default disabled:opacity-50";
  const primary = `${action} bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708] shadow-card`;
  const secondary = "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-glass-border bg-subtle px-2 text-[13px] font-bold text-ink disabled:cursor-default disabled:opacity-50";
  const disabled = !ready || tooLong || busy;
  const chip = "inline-flex min-h-8 cursor-pointer items-center rounded-full border border-glass-border bg-subtle px-3 text-[12px] font-bold text-ink";
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
              aria-label="Նկարի նախադիտում. քաշեք վերնագիրը կամ տեքստը՝ տեղը փոխելու համար"
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            {pageCount > 1 ? (
              <>
                <button className="absolute left-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page === 0} aria-label="Նախորդ նկարը" onClick={() => setPage(page - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page >= pageCount - 1} aria-label="Հաջորդ նկարը" onClick={() => setPage(page + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
              </>
            ) : null}
          </div>
          {tooLong ? (
            <p className="m-0 max-w-[340px] text-center text-[12.5px] font-semibold text-[#b3402f]">Ընտրված տեքստը շատ երկար է. «Կարգավորել» → «Տեքստ»-ում հանեք մի քանի հատված։</p>
          ) : pageCount > 1 ? (
            <p className="m-0 max-w-[340px] text-center text-[12.5px] text-muted">Կլինի <b className="text-ink">{pageCount} նկար</b>։ Մեկ նկարի համար՝ {editing ? "" : "«Կարգավորել» → "}«Տեքստ» → «Մեկ նկարում»։</p>
          ) : (
            <p className="m-0 text-center text-[11.5px] text-muted">Քաշեք վերնագիրը կամ տեքստը՝ տեղը փոխելու համար</p>
          )}
        </div>

        {editing ? (
          <div className="grid w-full max-w-[440px] gap-3.5 self-center pb-2 min-[760px]:self-start">
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

            <Row label="Տեքստ" aside={<span className="text-[11.5px] text-muted">{chosen?.size ?? 0} / {units.length} հատված</span>}>
              <div className="flex flex-wrap gap-1.5">
                <button className={chip} type="button" onClick={() => setChosen(fitOnePage(style))}>Մեկ նկարում</button>
                <button className={chip} type="button" onClick={() => setChosen(new Set(units.map((_, index) => index)))}>Ամբողջը</button>
                {units.length > 1 ? <button className={chip} type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "Փակել ցանկը" : "Ընտրել հատվածները"}</button> : null}
              </div>
              {picking ? (
                <ul className="m-0 grid max-h-[240px] list-none gap-1 overflow-y-auto rounded-[13px] border border-glass-border bg-subtle p-1.5">
                  {units.map((unit, index) => {
                    const on = Boolean(chosen?.has(index));
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

            <Segmented label="Տառի չափ" value={style.size} options={SIZES} onChange={(size) => update({ size })} />

            <Row label="Գույն">
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Գույն">
                <button type="button" role="radio" aria-checked={style.color === "auto"} onClick={() => update({ color: "auto" })}
                  className={`min-h-9 cursor-pointer rounded-full border-2 px-3 text-[12px] font-bold text-ink ${style.color === "auto" ? "border-[#d9b56f] bg-[rgb(217_181_111/18%)]" : "border-glass-border bg-subtle"}`}>Ավտո</button>
                {STORY_SWATCHES.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={style.color === value} aria-label={value}
                    className={`size-9 cursor-pointer rounded-full border-2 ${style.color === value ? "border-[#d9b56f] shadow-[0_0_0_2px_rgb(217_181_111/40%)]" : "border-glass-border"}`}
                    style={{ background: value }} onClick={() => update({ color: value })} />
                ))}
                {/* Ցանկացած գույն */}
                <label className={`relative size-9 cursor-pointer overflow-hidden rounded-full border-2 ${style.color !== "auto" && !STORY_SWATCHES.includes(style.color) ? "border-[#d9b56f]" : "border-glass-border"}`}
                  style={{ background: style.color !== "auto" && !STORY_SWATCHES.includes(style.color) ? style.color : "conic-gradient(#e44,#ec4,#4c6,#4ce,#46e,#c4e,#e44)" }} title="Ցանկացած գույն">
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="color" aria-label="Ցանկացած գույն"
                    value={style.color === "auto" ? "#f7ecd2" : style.color} onChange={(event) => update({ color: event.target.value })} />
                </label>
              </div>
            </Row>

            <Segmented label="Վերնագիր" value={style.showTitle} options={[[true, "Ցույց տալ"], [false, "Թաքցնել"]]} onChange={(showTitle) => update({ showTitle })} />
            <Segmented label="Հավասարեցում" value={style.align} options={ALIGNS} onChange={(align) => update({ align })} />
            <Segmented label="Տառատեսակ" value={style.font} options={FONTS} onChange={(font) => update({ font })} />
            <Segmented label="Շերտ տեքստի տակ" value={style.shade} options={SHADES} onChange={(shade) => update({ shade })} />
            <button className={`${secondary} flex-none`} type="button" onClick={resetPlaces}><RotateCcw size={16} aria-hidden="true" /> Վերադարձնել տեղերը</button>
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
