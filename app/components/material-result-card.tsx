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

const mediaLabels: Record<string, string> = {
  audio: "Աուդիո",
  video: "Վիդեո",
  photo: "Նկար",
  poll: "Հարցում",
};

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
      <mark className="material-search-highlight" key={`${part}-${index}`}>
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
    try {
      if (navigator.share) {
        await navigator.share({
          title: material.title,
          text: shareText,
          url: material.telegramUrl,
        });
        return;
      }
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
    <li className={`material-card-shell${isNoteOpen ? " has-note-composer" : ""}`}>
      <a
        className="material-card"
        href={material.telegramUrl}
        target="_blank"
        rel="noreferrer"
        onClick={openTelegramPost}
      >
        <span className="material-card-content">
          {material.categoryName ? (
            <span className="material-category-name">{material.categoryName}</span>
          ) : null}
          {date ? <span className="material-date">{date}</span> : null}
          <strong>{highlightText(material.title, highlightPattern)}</strong>
          {material.excerpt ? (
            <span className="material-excerpt">
              {highlightText(material.excerpt, highlightPattern)}
            </span>
          ) : null}
          {material.mediaTypes.length > 0 ? (
            <span className="material-media-list">
              {material.mediaTypes.map((mediaType) => (
                <span key={mediaType}>{mediaLabels[mediaType] ?? mediaType}</span>
              ))}
            </span>
          ) : null}
          {material.personalNote ? (
            <span className="material-personal-note">
              <StickyNote aria-hidden="true" size={14} strokeWidth={1.8} />
              {material.personalNote}
            </span>
          ) : null}
        </span>
      </a>
      <span className="material-actions">
        {canSave ? (
          <button
            className={`material-action material-save${isSaved ? " is-saved" : ""}`}
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
            className="material-action material-note-edit"
            type="button"
            onClick={openNoteComposer}
            aria-label="Խմբագրել անձնական նշումը"
            title="Խմբագրել անձնական նշումը"
          >
            <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
        ) : null}
        <button
          className="material-action material-share"
          type="button"
          onClick={handleShare}
          aria-label={shareStatus === "copied" ? "Հղումը պատճենված է" : "Կիսվել նյութով"}
          title={shareStatus === "copied" ? "Պատճենվեց" : "Կիսվել"}
        >
          {shareStatus === "copied" ? (
            <Check aria-hidden="true" size={17} strokeWidth={2} />
          ) : (
            <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />
          )}
        </button>
      </span>
      {isNoteOpen ? (
        <form className="material-note-composer" onSubmit={handleNoteSubmit}>
          <label htmlFor={`note-${material.id}`}>Անձնական հուշում</label>
          <div>
            <input
              id={`note-${material.id}`}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.currentTarget.value)}
              maxLength={160}
              placeholder="Օրինակ՝ կարդալ երեկոյան…"
              autoFocus
            />
            <button type="submit" disabled={isSaving} aria-label="Պահել նյութը">
              <Check aria-hidden="true" size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setIsNoteOpen(false)}
              aria-label="Փակել առանց պահելու"
            >
              <X aria-hidden="true" size={17} strokeWidth={2} />
            </button>
          </div>
          <small>Այս նշումը տեսանելի է միայն քեզ։ Կարող ես թողնել դատարկ։</small>
        </form>
      ) : null}
    </li>
  );
});
