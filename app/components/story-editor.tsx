import { ChevronLeft, ChevronRight, Download, Send, Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../utils/scroll-lock";
import { STORY_DESIGNS, storyBackground, type StoryTone } from "../utils/story-backgrounds";
import { STORY_HEIGHT, STORY_WIDTH, type StoryAlign, type StoryPosition, type StorySize } from "../utils/story-layout";
import {
  STORY_COLORS, canvasBlob, defaultColor, drawStoryPage, loadBackground, loadStoryFonts, planFor,
  type StoryFont, type StoryShade, type StoryStyle,
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

const SETTINGS_KEY = "story-style";

type Saved = Partial<StoryStyle> & { design?: string; tone?: StoryTone };

function readSaved(): Saved {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Saved; } catch { return {}; }
}

function writeSaved(value: Saved) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* Պահելը պարտադիր չէ։ */ }
}

const SIZES: Array<[StorySize, string]> = [["auto", "Ավտո"], ["sm", "Փոքր"], ["md", "Միջին"], ["lg", "Մեծ"], ["xl", "Շատ մեծ"]];
const POSITIONS: Array<[StoryPosition, string]> = [["top", "Վերև"], ["center", "Մեջտեղ"], ["bottom", "Ներքև"]];
const ALIGNS: Array<[StoryAlign, string]> = [["center", "Մեջտեղում"], ["start", "Ձախից"]];
const FONTS: Array<[StoryFont, string]> = [["book", "Գրքային"], ["serif", "Նոտո"]];
const SHADES: Array<[StoryShade, string]> = [[0, "Չկա"], [1, "Թեթև"], [2, "Խիտ"]];
const TONES: Array<[StoryTone, string]> = [["dark", "Մուգ"], ["light", "Բաց"]];

function Segmented<T extends string | number>({ label, value, options, onChange }: {
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-bold text-muted">{label}</span>
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

/**
 * Աղոթքը, սաղմոսը կամ համարը՝ որպես story-ի նկար (1080×1920)։ Ընթերցողը ընտրում է ֆոնը, տառի
 * չափը, դիրքը, գույնը. երկար տեքստը բաժանվում է մի քանի նկարի։ apostolic.am-ը և վերնագիրը
 * փոխել չի կարելի։ Հեռախոսում նկարները գնում են համակարգի «Կիսվել» պատուհան (Instagram, Facebook,
 * Telegram story), Mini App-ում՝ ուղիղ Telegram story։
 */
export function StoryEditor({ source, onClose }: { source: StorySource; onClose: () => void }) {
  useScrollLock(true);
  const saved = useMemo(readSaved, []);
  const [design, setDesign] = useState(() => saved.design ?? STORY_DESIGNS[0].id);
  const [tone, setTone] = useState<StoryTone>(() => saved.tone ?? "dark");
  const background = useMemo(() => storyBackground(design, tone), [design, tone]);
  const [style, setStyle] = useState<StoryStyle>(() => ({
    size: saved.size ?? "auto",
    position: saved.position ?? "center",
    align: saved.align ?? "center",
    color: saved.color ?? defaultColor(storyBackground(saved.design, saved.tone ?? "dark")),
    font: saved.font ?? "book",
    shade: saved.shade ?? 0,
  }));
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [tooLong, setTooLong] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const previewRef = useRef<HTMLCanvasElement>(null);
  // Պատրաստի ֆայլերը՝ որ «Կիսվել»-ը անմիջապես բացի պատուհանը (iOS-ը սպասել չի թողնում)։
  const filesRef = useRef<File[] | null>(null);
  const telegram = typeof window === "undefined" ? null : telegramApp();
  const canStory = Boolean(telegram?.shareToStory && telegram.isVersionAtLeast?.("7.8"));
  const canDownloadInTelegram = Boolean(telegram?.downloadFile && telegram.isVersionAtLeast?.("8.0"));
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [new File([new Uint8Array(1)], "a.jpg", { type: "image/jpeg" })] });

  useEffect(() => { writeSaved({ ...style, design, tone }); }, [design, style, tone]);

  const update = useCallback((patch: Partial<StoryStyle>) => setStyle((current) => ({ ...current, ...patch })), []);
  const chooseTone = (next: StoryTone) => {
    // Մուգից բաց անցնելիս տառերի գույնն էլ է փոխվում, որ կարդացվի։
    if (next !== tone && style.color === defaultColor(background)) update({ color: defaultColor(storyBackground(design, next)) });
    setTone(next);
  };

  // Նախադիտում և պատրաստի ֆայլեր
  useEffect(() => {
    let cancelled = false;
    filesRef.current = null;
    setReady(false);
    const timer = window.setTimeout(async () => {
      await loadStoryFonts();
      const image = await loadBackground(background.src);
      if (cancelled) return;
      const work = document.createElement("canvas");
      work.width = STORY_WIDTH;
      work.height = STORY_HEIGHT;
      const context = work.getContext("2d");
      const preview = previewRef.current?.getContext("2d");
      if (!context || !preview) return;
      const plan = planFor(context, source.text, style, background);
      const current = Math.min(page, plan.pages.length - 1);
      setPageCount(plan.pages.length);
      setTooLong(plan.tooLong);
      if (current !== page) setPage(current);
      const draw = (target: CanvasRenderingContext2D, index: number) => drawStoryPage(target, { background, image, style, plan, page: index, title: source.title });
      draw(preview, current);
      if (plan.tooLong) return;
      const files: File[] = [];
      for (let index = 0; index < plan.pages.length; index += 1) {
        draw(context, index);
        const blob = await canvasBlob(work);
        if (cancelled || !blob) return;
        files.push(new File([blob], fileName(source.path, index, plan.pages.length), { type: "image/jpeg" }));
      }
      filesRef.current = files;
      setReady(true);
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [background, page, source, style]);

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? "" : current)), 3_500);
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

  const action = "inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[15px] border-0 px-3 text-[14px] font-bold disabled:cursor-default disabled:opacity-50";
  const primary = `${action} bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708] shadow-card`;
  const secondary = `${action} border border-glass-border bg-subtle text-ink`;
  const disabled = !ready || tooLong || busy;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-[var(--page-bg)] pt-[var(--tg-inset-top,0px)] pb-[var(--tg-inset-bottom,0px)]" role="dialog" aria-modal="true" aria-label="Նկարով կիսվել">
      <header className="flex items-center justify-between gap-2 border-b border-glass-border px-4 py-2.5">
        <strong className="font-noto text-[16px] text-ink">Նկարով կիսվել</strong>
        <button className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-subtle text-ink" type="button" aria-label="Փակել" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-center min-[760px]:gap-6">
        <div className="grid shrink-0 justify-items-center gap-2 min-[760px]:sticky min-[760px]:top-0">
          <div className="relative">
            <canvas ref={previewRef} width={STORY_WIDTH} height={STORY_HEIGHT} className="block h-[min(52svh,560px)] w-auto rounded-[18px] shadow-[0_14px_40px_rgb(20_8_24/35%)] min-[760px]:h-[min(78svh,680px)]" aria-label="Նկարի նախադիտում" />
            {pageCount > 1 ? (
              <>
                <button className="absolute left-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page === 0} aria-label="Նախորդ նկարը" onClick={() => setPage(page - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgb(0_0_0/45%)] text-white disabled:opacity-30" type="button" disabled={page >= pageCount - 1} aria-label="Հաջորդ նկարը" onClick={() => setPage(page + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
              </>
            ) : null}
          </div>
          {tooLong ? (
            <p className="m-0 max-w-[320px] text-center text-[12.5px] font-semibold text-[#b3402f]">Տեքստը շատ երկար է նկարի համար. ընտրեք ավելի փոքր տառ։</p>
          ) : pageCount > 1 ? (
            <p className="m-0 max-w-[320px] text-center text-[12.5px] text-muted">Տեքստը երկար է, ուստի պատրաստվել է <b className="text-ink">{pageCount} նկար</b>՝ իրար հետևից story-ում դնելու համար։</p>
          ) : null}
        </div>

        <div className="grid w-full max-w-[440px] gap-3 self-center min-[760px]:self-start">
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
          <Segmented label="Ֆոնի տոն" value={tone} options={TONES} onChange={chooseTone} />
          <Segmented label="Տառի չափ" value={style.size} options={SIZES} onChange={(size) => update({ size })} />
          <Segmented label="Դիրք" value={style.position} options={POSITIONS} onChange={(position) => update({ position })} />
          <Row label="Գույն">
            <div className="flex gap-2" role="radiogroup" aria-label="Գույն">
              {STORY_COLORS.map((entry) => (
                <button key={entry.id} type="button" role="radio" aria-checked={entry.id === style.color} aria-label={entry.label} title={entry.label}
                  className={`size-9 cursor-pointer rounded-full border-2 ${entry.id === style.color ? "border-[#d9b56f] shadow-[0_0_0_2px_rgb(217_181_111/40%)]" : "border-glass-border"}`}
                  style={{ background: entry.value }} onClick={() => update({ color: entry.id })} />
              ))}
            </div>
          </Row>
          <Segmented label="Տառատեսակ" value={style.font} options={FONTS} onChange={(font) => update({ font })} />
          <Segmented label="Հավասարեցում" value={style.align} options={ALIGNS} onChange={(align) => update({ align })} />
          <Segmented label="Շերտ տեքստի տակ" value={style.shade} options={SHADES} onChange={(shade) => update({ shade })} />
        </div>
      </div>

      <footer className="grid gap-2 border-t border-glass-border px-4 pt-3 pb-3">
        {notice ? <p className="m-0 text-center text-[12.5px] font-semibold text-gold-bright" role="status">{notice}</p> : null}
        <div className="mx-auto flex w-full max-w-[520px] gap-2">
          {canStory ? (
            <>
              <button className={primary} type="button" disabled={disabled} onClick={telegramStory}><Send size={18} aria-hidden="true" /> {pageCount > 1 ? `Story (${page + 1}/${pageCount})` : "Telegram story"}</button>
              {canShareFiles ? <button className={secondary} type="button" disabled={disabled} onClick={shareFiles}><Share2 size={18} aria-hidden="true" /> Կիսվել</button>
                : canDownloadInTelegram ? <button className={secondary} type="button" disabled={disabled} onClick={telegramSave}><Download size={18} aria-hidden="true" /> Պահել</button> : null}
            </>
          ) : canShareFiles ? (
            <>
              <button className={primary} type="button" disabled={disabled} onClick={shareFiles}><Share2 size={18} aria-hidden="true" /> Կիսվել{pageCount > 1 ? ` (${pageCount} նկար)` : ""}</button>
              <button className={secondary} type="button" disabled={disabled} onClick={saveFiles} aria-label="Պահել նկարը"><Download size={18} aria-hidden="true" /> Պահել</button>
            </>
          ) : (
            <button className={primary} type="button" disabled={disabled} onClick={canDownloadInTelegram ? telegramSave : saveFiles}><Download size={18} aria-hidden="true" /> Պահել նկար{pageCount > 1 ? "ները" : "ը"}</button>
          )}
        </div>
        {canShareFiles && !canStory ? <p className="m-0 text-center text-[11.5px] text-muted">Ցանկում ընտրեք Instagram, Facebook կամ Telegram՝ նկարը story-ում դնելու համար։</p> : null}
      </footer>
    </div>,
    document.body,
  );
}
