import {
  Bookmark,
  Check,
  Pencil,
  Share2,
  StickyNote,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { formatArmenianDate } from "../utils/armenian-date";

type MaterialResultCardProps = {
  material: {
    id: string;
    title: string;
    telegramUrl: string;
    dateValue: string | null;
    mediaTypes: string[];
    categoryName?: string;
    excerpt?: string | null;
    personalNote?: string;
  };
  canSave: boolean;
  highlightQuery?: string;
  isSaved: boolean;
  isSaving?: boolean;
  allowNoteEditing?: boolean;
  onSavedChange: (
    materialId: string,
    saved: boolean,
    personalNote?: string,
  ) => void;
};

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type HighlightPattern = {
  exactMatch: RegExp;
  parts: RegExp;
};

function createHighlightPattern(query: string): HighlightPattern | null {
  const terms = Array.from(
    new Set(
      query
        .normalize("NFC")
        .trim()
        .split(/\s+/u)
        .filter((term) => Array.from(term).length >= 2),
    ),
  ).sort((first, second) => second.length - first.length);
  if (terms.length === 0) return null;

  const pattern = terms.map(escapeRegularExpression).join("|");
  return {
    exactMatch: new RegExp(`^(?:${pattern})$`, "iu"),
    parts: new RegExp(`(${pattern})`, "giu"),
  };
}

function highlightText(value: string, pattern: HighlightPattern | null) {
  if (!pattern) return value;
  const parts = value.split(pattern.parts);

  return parts.map((part, index) =>
    pattern.exactMatch.test(part) ? (
      <mark
        className="rounded-[0.28em] bg-[rgb(240_196_88/38%)] px-[0.14em] py-[0.04em] text-inherit shadow-[0_0_0_1px_rgb(240_196_88/16%)] [box-decoration-break:clone]"
        key={`${part}-${index}`}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      openTelegramLink?: (url: string) => void;
      platform?: string;
    };
  };
};

export function openTelegramPost(event: MouseEvent<HTMLAnchorElement>) {
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  if (!webApp?.openTelegramLink || webApp.platform === "unknown") return;
  event.preventDefault();
  webApp.openTelegramLink(event.currentTarget.href);
}

export const MaterialResultCard = memo(function MaterialResultCard({
  material,
  canSave,
  highlightQuery = "",
  isSaved,
  isSaving = false,
  allowNoteEditing = false,
  onSavedChange,
}: MaterialResultCardProps) {
  const date = formatArmenianDate(material.dateValue);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(material.personalNote ?? "");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const shareResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightPattern = useMemo(
    () => createHighlightPattern(highlightQuery),
    [highlightQuery],
  );

  useEffect(
    () => () => {
      if (shareResetRef.current) clearTimeout(shareResetRef.current);
    },
    [],
  );

  const openNoteComposer = useCallback(() => {
    setNoteDraft(material.personalNote ?? "");
    setIsNoteOpen(true);
  }, [material.personalNote]);

  const handleBookmark = useCallback(() => {
    if (isSaved) {
      onSavedChange(material.id, false);
      return;
    }
    openNoteComposer();
  }, [isSaved, material.id, onSavedChange, openNoteComposer]);

  const handleNoteSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSavedChange(material.id, true, noteDraft);
      setIsNoteOpen(false);
    },
    [material.id, noteDraft, onSavedChange],
  );

  const handleShare = useCallback(async () => {
    const shareText = material.excerpt
      ? `${material.title}\n\n${material.excerpt}`
      : material.title;
    const text = `${shareText}\n\n${material.telegramUrl}`;
    const shareData = {
      title: material.title,
      text,
    };
    try {
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare(shareData))
      ) {
        await navigator.share(shareData);
        return;
      }
      const shareWindow = window.open(
        `https://t.me/share/url?url=${encodeURIComponent(material.telegramUrl)}&text=${encodeURIComponent(shareText)}`,
        "_blank",
        "noopener,noreferrer",
      );
      if (shareWindow) return;

      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
      if (shareResetRef.current) clearTimeout(shareResetRef.current);
      shareResetRef.current = setTimeout(() => setShareStatus("idle"), 1_800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(material.telegramUrl)}&text=${encodeURIComponent(material.title)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  }, [material.excerpt, material.telegramUrl, material.title]);

  return (
    <li className={`relative animate-glass-enter${isNoteOpen ? " min-h-[174px]" : ""}`}>
      <a
        className={`relative isolate flex min-h-[82px] items-center gap-3.5 overflow-hidden rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_46%),var(--card-glass)] px-3.5 pt-3.5 pb-[54px] text-inherit no-underline shadow-card transition-[border-color,transform,background] duration-[180ms] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(115deg,rgb(255_255_255/13%),transparent_24%_74%,rgb(217_181_111/6%))] hover:-translate-y-px hover:border-[rgb(217_181_111/30%)] hover:bg-[linear-gradient(145deg,rgb(255_255_255/9%),transparent_46%),var(--glass-strong)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]${isNoteOpen ? " pointer-events-none" : ""}`}
        href={material.telegramUrl}
        target="_blank"
        rel="noreferrer"
        onClick={openTelegramPost}
        tabIndex={isNoteOpen ? -1 : undefined}
        aria-hidden={isNoteOpen ? true : undefined}
      >
        <span className="relative z-1 grid min-w-0 flex-1 gap-[7px]">
          {material.categoryName ? (
            <span className="text-[0.69rem] font-[780] tracking-[0.035em] text-plum">{material.categoryName}</span>
          ) : null}
          {date ? <span className="text-[0.72rem] font-[750] text-gold">{date}</span> : null}
          <strong className="text-[clamp(0.92rem,1.55vw,1.02rem)] leading-[1.46] [overflow-wrap:anywhere]">{highlightText(material.title, highlightPattern)}</strong>
          {material.excerpt ? (
            <span className="line-clamp-2 overflow-hidden text-[0.76rem] leading-[1.5] text-muted">
              {highlightText(material.excerpt, highlightPattern)}
            </span>
          ) : null}
          {material.personalNote ? (
            <span className="flex items-start gap-[7px] rounded-[11px] border border-[rgb(217_181_111/15%)] bg-[rgb(217_181_111/7%)] px-2.5 py-[9px] text-[0.72rem] leading-[1.45] text-gold-bright [&>svg]:mt-px [&>svg]:shrink-0">
              <StickyNote aria-hidden="true" size={14} strokeWidth={1.8} />
              {highlightText(material.personalNote, highlightPattern)}
            </span>
          ) : null}
        </span>
      </a>
      {!isNoteOpen ? (
        <span className="absolute right-[11px] bottom-[11px] z-3 flex gap-1.5">
          {canSave ? (
            <button
              className={`grid size-[34px] cursor-pointer place-items-center rounded-[11px] border bg-nav-glass p-0 transition-[border-color,color,background,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60 ${isSaved ? "border-[rgb(217_181_111/34%)] text-gold-bright" : "border-glass-border text-faint"}`}
              type="button"
              disabled={isSaving}
              onClick={handleBookmark}
              aria-label={isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}
              title={isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}
            >
              <Bookmark
                aria-hidden="true"
                size={17}
                strokeWidth={1.9}
                fill={isSaved ? "currentColor" : "none"}
              />
            </button>
          ) : null}
          {allowNoteEditing && isSaved ? (
            <button
              className="grid size-[34px] cursor-pointer place-items-center rounded-[11px] border border-glass-border bg-nav-glass p-0 text-faint transition-[border-color,color,background,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
              type="button"
              onClick={openNoteComposer}
              aria-label="Խմբագրել անձնական նշումը"
              title="Խմբագրել անձնական նշումը"
            >
              <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
            </button>
          ) : null}
          <button
            className="grid size-[34px] cursor-pointer place-items-center rounded-[11px] border border-glass-border bg-nav-glass p-0 text-gold transition-[border-color,color,background,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
            type="button"
            onClick={handleShare}
            aria-label={
              shareStatus === "copied" ? "Հղումը պատճենված է" : "Կիսվել նյութով"
            }
            title={shareStatus === "copied" ? "Պատճենվեց" : "Կիսվել"}
          >
            {shareStatus === "copied" ? (
              <Check aria-hidden="true" size={17} strokeWidth={2} />
            ) : (
              <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />
            )}
          </button>
        </span>
      ) : null}
      {isNoteOpen ? (
        <form
          className="absolute inset-2 z-6 grid content-center gap-2 rounded-[15px] border border-[rgb(217_181_111/24%)] bg-[linear-gradient(145deg,rgb(255_255_255/9%),transparent_50%),var(--nav-surface)] p-3 shadow-card"
          onSubmit={handleNoteSubmit}
          role="dialog"
          aria-label={`${material.title} — անձնական հուշում`}
        >
          <label className="text-[0.72rem] font-[760] text-gold-bright" htmlFor={`note-${material.id}`}>Անձնական հուշում</label>
          <div className="grid grid-cols-[minmax(0,1fr)_38px_38px] gap-[7px]">
            <input
              id={`note-${material.id}`}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.currentTarget.value)}
              maxLength={160}
              placeholder="Օրինակ՝ կարդալ երեկոյան…"
              autoFocus
              className="min-h-11 w-full min-w-0 rounded-[13px] border border-glass-border bg-control px-3 py-[9px] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none focus:border-[rgb(217_181_111/40%)]"
            />
            <button className="grid h-11 w-[38px] cursor-pointer place-items-center rounded-[13px] border border-[rgb(217_181_111/24%)] bg-[rgb(217_181_111/10%)] p-0 text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSaving} aria-label="Պահել նյութը">
              <Check aria-hidden="true" size={17} strokeWidth={2} />
            </button>
            <button
              className="grid h-11 w-[38px] cursor-pointer place-items-center rounded-[13px] border border-glass-border bg-subtle p-0 text-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
              type="button"
              onClick={() => setIsNoteOpen(false)}
              aria-label="Փակել առանց պահելու"
            >
              <X aria-hidden="true" size={17} strokeWidth={2} />
            </button>
          </div>
          <small className="text-[0.64rem] leading-[1.4] text-faint">Այս նշումը տեսանելի է միայն քեզ։ Կարող ես թողնել դատարկ։</small>
        </form>
      ) : null}
    </li>
  );
});
