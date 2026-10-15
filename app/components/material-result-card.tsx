import {
  Bookmark,
  Check,
  ExternalLink,
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
import { Link } from "react-router";

import { formatArmenianDate } from "../utils/armenian-date";
import { fieldControl, iconButton, interactiveGlassCard } from "./ui-styles";

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
        className="rounded-[4px] bg-[rgb(240_196_88/38%)] px-[2px] py-[1px] text-inherit shadow-[0_0_0_1px_rgb(240_196_88/16%)] [box-decoration-break:clone]"
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
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [isNoteMounted, setIsNoteMounted] = useState(false);
  const [noteDraft, setNoteDraft] = useState(material.personalNote ?? "");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const shareResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightPattern = useMemo(
    () => createHighlightPattern(highlightQuery),
    [highlightQuery],
  );

  useEffect(
    () => () => {
      if (shareResetRef.current) clearTimeout(shareResetRef.current);
      if (noteTransitionRef.current) clearTimeout(noteTransitionRef.current);
    },
    [],
  );

  const openNoteComposer = useCallback(() => {
    if (noteTransitionRef.current) clearTimeout(noteTransitionRef.current);
    setNoteDraft(material.personalNote ?? "");
    setIsNoteMounted(true);
    requestAnimationFrame(() => setIsNoteExpanded(true));
  }, [material.personalNote]);

  const closeNoteComposer = useCallback(() => {
    setIsNoteExpanded(false);
    if (noteTransitionRef.current) clearTimeout(noteTransitionRef.current);
    noteTransitionRef.current = setTimeout(() => {
      setIsNoteMounted(false);
      noteTransitionRef.current = null;
    }, 220);
  }, []);

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
      closeNoteComposer();
    },
    [closeNoteComposer, material.id, noteDraft, onSavedChange],
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
    <li className="animate-glass-enter">
      <div className="relative">
        <Link
          className={`${interactiveGlassCard} flex min-h-[76px] items-center gap-[14px] px-[13px] pt-[12px] pb-[50px] text-inherit no-underline${isNoteMounted ? " pointer-events-none" : ""}`}
          to={`/materials/${material.id}`}
          tabIndex={isNoteMounted ? -1 : undefined}
          aria-hidden={isNoteMounted ? true : undefined}
        >
        <span className="relative z-1 grid min-w-0 flex-1 gap-[7px]">
          {material.categoryName ? (
            <span className="text-[11px] font-[780] tracking-[0.56px] text-plum">{material.categoryName}</span>
          ) : null}
          {date ? <span className="text-[12px] font-[750] text-gold">{date}</span> : null}
          <strong className="text-[15px] leading-[22px] [overflow-wrap:anywhere] min-[960px]:text-[16px] min-[960px]:leading-[23px]">{highlightText(material.title, highlightPattern)}</strong>
          {material.excerpt ? (
            <span className="line-clamp-2 overflow-hidden text-[12px] leading-[1.5] text-muted">
              {highlightText(material.excerpt, highlightPattern)}
            </span>
          ) : null}
          {material.personalNote ? (
            <span className="flex items-start gap-[7px] rounded-[11px] border border-[rgb(217_181_111/15%)] bg-[rgb(217_181_111/7%)] px-2.5 py-[9px] text-[12px] leading-[1.45] text-gold-bright [&>svg]:mt-px [&>svg]:shrink-0">
              <StickyNote aria-hidden="true" size={14} strokeWidth={1.8} />
              {highlightText(material.personalNote, highlightPattern)}
            </span>
          ) : null}
        </span>
        </Link>
      {!isNoteMounted ? (
        <span className="absolute right-[11px] bottom-[11px] z-3 flex gap-1.5">
          {canSave ? (
            <button
              className={`${iconButton} size-[34px] rounded-[11px] bg-nav-glass disabled:cursor-wait disabled:opacity-60 ${isSaved ? "border-[rgb(217_181_111/34%)] text-gold-bright" : "text-faint"}`}
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
              className={`${iconButton} size-[34px] rounded-[11px] bg-nav-glass text-faint`}
              type="button"
              onClick={openNoteComposer}
              aria-label="Խմբագրել անձնական նշումը"
              title="Խմբագրել անձնական նշումը"
            >
              <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
            </button>
          ) : null}
          <a
            className={`${iconButton} size-[34px] rounded-[11px] bg-nav-glass text-muted`}
            href={material.telegramUrl}
            target="_blank"
            rel="noreferrer"
            onClick={openTelegramPost}
            aria-label="Բացել սկզբնականը Telegram-ում"
            title="Telegram"
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
          </a>
          <button
            className={`${iconButton} size-[34px] rounded-[11px] bg-nav-glass text-gold`}
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
      </div>
      {isNoteMounted ? (
        <div
          className={`grid transition-[grid-template-rows,opacity,margin] duration-[220ms] ease-out ${isNoteExpanded ? "mt-[10px] grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden">
        <form
          className="grid gap-[8px] rounded-[15px] border border-[rgb(217_181_111/24%)] bg-[linear-gradient(145deg,rgb(255_255_255/9%),transparent_50%),var(--nav-surface)] p-[12px] shadow-card"
          onSubmit={handleNoteSubmit}
          role="dialog"
          aria-label={`${material.title} — անձնական հուշում`}
        >
          <label className="text-[12px] font-[760] text-gold-bright" htmlFor={`note-${material.id}`}>Անձնական հուշում</label>
          <div className="grid grid-cols-[minmax(0,1fr)_38px_38px] gap-[7px]">
            <input
              id={`note-${material.id}`}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.currentTarget.value)}
              maxLength={160}
              placeholder="Օրինակ՝ կարդալ երեկոյան…"
              autoFocus
              className={`${fieldControl} min-w-0 rounded-[13px]`}
            />
            <button className="grid h-11 w-[38px] cursor-pointer place-items-center rounded-[13px] border border-[rgb(217_181_111/24%)] bg-[rgb(217_181_111/10%)] p-0 text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSaving} aria-label="Պահել նյութը">
              <Check aria-hidden="true" size={17} strokeWidth={2} />
            </button>
            <button
              className="grid h-11 w-[38px] cursor-pointer place-items-center rounded-[13px] border border-glass-border bg-subtle p-0 text-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
              type="button"
              onClick={closeNoteComposer}
              aria-label="Փակել առանց պահելու"
            >
              <X aria-hidden="true" size={17} strokeWidth={2} />
            </button>
          </div>
          <small className="text-[10px] leading-[1.4] text-faint">Այս նշումը տեսանելի է միայն քեզ։ Կարող ես թողնել դատարկ։</small>
        </form>
          </div>
        </div>
      ) : null}
    </li>
  );
});
