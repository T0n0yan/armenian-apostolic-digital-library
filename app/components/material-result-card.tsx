import {
  AlignLeft,
  BarChart3,
  Bookmark,
  Check,
  ExternalLink,
  FileQuestion,
  FileText,
  Headphones,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  MapPin,
  Pencil,
  Play,
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
import { Link, useNavigation } from "react-router";

import type { BridgeContentType, BridgeSearchHit, BridgeSearchMatchReason } from "../../shared/telegram-bridge-contract";
import type { MaterialCardPreview } from "../data/materials.server";
import { formatArmenianDate } from "../utils/armenian-date";
import { isPendingNavigation } from "../../shared/navigation-state";
import { fieldControl, iconButton, interactiveGlassCard } from "./ui-styles";
import { isNearlyBlackImage } from "../utils/image-darkness";
import { ShareButton } from "./share-button";

type MaterialResultCardProps = {
  material: {
    id: string;
    title: string;
    telegramUrl: string;
    dateValue: string | null;
    publishedAt?: string | null;
    mediaTypes: string[];
    categoryName?: string;
    excerpt?: string | null;
    contentType: BridgeContentType;
    preview: MaterialCardPreview;
    personalNote?: string;
    matchReasons?: Array<"telegram" | "personal-note" | BridgeSearchMatchReason>;
    matchedMessageId?: number;
    searchHit?: BridgeSearchHit;
  };
  canSave: boolean;
  highlightQuery?: string;
  /**
   * "text": no thumbnail column or type badge (prayers, Bible questions).
   * "video": full-width 16:9 poster on top (gospel teachings).
   */
  variant?: "default" | "text" | "video";
  /** The topic's usual content type (e.g. polls in Bible questions); its badge is redundant there. */
  typicalType?: BridgeContentType;
  isSaved: boolean;
  isSaving?: boolean;
  allowNoteEditing?: boolean;
  onSavedChange: (
    materialId: string,
    saved: boolean,
    personalNote?: string,
  ) => void;
};

function durationLabel(seconds: number | null) {
  if (!seconds || seconds < 0) return null;
  return `${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, "0")}`;
}

function contentTypeMeta(type: BridgeContentType, count: number) {
  switch (type) {
    case "photo": return { label: "Նկար", Icon: ImageIcon };
    case "album": return { label: `${count} նկար`, Icon: Images };
    case "video": return { label: "Տեսանյութ", Icon: Play };
    case "audio": return { label: "Աուդիո", Icon: Headphones };
    case "voice": return { label: "Ձայնային", Icon: Headphones };
    case "poll": return { label: "Հարցում", Icon: BarChart3 };
    case "location": return { label: "Տեղադրություն", Icon: MapPin };
    case "document": return { label: "Փաստաթուղթ", Icon: FileText };
    case "animation": return { label: "Շարժապատկեր", Icon: Play };
    case "unsupported": return { label: "Այլ նյութ", Icon: FileQuestion };
    default: return { label: "Տեքստ", Icon: AlignLeft };
  }
}

function matchReasonLabel(
  reason: NonNullable<MaterialResultCardProps["material"]["matchReasons"]>[number],
  material: MaterialResultCardProps["material"],
) {
  switch (reason) {
    case "telegram": return "Telegram նյութ";
    case "personal-note": return "Իմ նշումից";
    case "telegram-id": return `Համընկնում՝ Telegram #${material.matchedMessageId ?? material.id.split("_").at(-1) ?? ""}`;
    case "title": return "Համընկնում՝ վերնագրում";
    case "body": return "Համընկնում՝ տեքստում";
    case "caption": return "Համընկնում՝ նկարագրության մեջ";
    case "poll-question":
    case "poll-option": return "Համընկնում՝ հարցման մեջ";
    case "location": return "Համընկնում՝ վայրում";
    case "audio": return "Համընկնում՝ աուդիոյում";
    case "document": return "Համընկնում՝ փաստաթղթում";
    case "topic": return "Համընկնում՝ թեմայում";
    case "hashtag": return "Համընկնում՝ պիտակում";
    case "transliteration": return "Տառադարձմամբ";
    case "fuzzy": return "Մոտավոր համընկնում";
  }
}

// The snippet label already says where a match is, so a card shows at most one badge, and only
// when it adds information the snippet can't: an approximate, transliterated, ID or note match.
const informativeMatchReasons = ["personal-note", "telegram-id", "transliteration", "fuzzy"] as const;

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

function highlightHit(hit: BridgeSearchHit) {
  const start = Math.max(0, Math.min(hit.snippet.length, hit.snippetMatchStart));
  const end = Math.max(start, Math.min(hit.snippet.length, start + hit.snippetMatchLength));
  return <>{hit.snippet.slice(0, start)}<mark className="rounded-[4px] bg-[rgb(240_196_88/38%)] px-[2px] py-[1px] text-inherit shadow-[0_0_0_1px_rgb(240_196_88/16%)] [box-decoration-break:clone]">{hit.snippet.slice(start, end)}</mark>{hit.snippet.slice(end)}</>;
}

function hitSourceLabel(source: BridgeSearchHit["source"]) {
  const labels: Record<BridgeSearchHit["source"], string> = {
    title: "Վերնագրից", content: "Նյութի տեքստից", caption: "Նկարագրությունից",
    poll: "Հարցումից", location: "Տեղադրությունից", audio: "Աուդիոյից",
    document: "Փաստաթղթից", topic: "Բաժնից", hashtag: "Պիտակից",
    "personal-note": "Իմ նշումից",
  };
  return labels[source];
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
  variant = "default",
  typicalType,
  isSaved,
  isSaving = false,
  allowNoteEditing = false,
  onSavedChange,
}: MaterialResultCardProps) {
  const date = formatArmenianDate(material.dateValue ?? material.publishedAt ?? null);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [isNoteMounted, setIsNoteMounted] = useState(false);
  const [noteDraft, setNoteDraft] = useState(material.personalNote ?? "");
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const navigation = useNavigation();
  const targetPath = `/materials/${material.id}`;
  const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
  const typeMeta = contentTypeMeta(material.contentType, material.preview.mediaCount);
  const extraMatchReason = informativeMatchReasons.find((reason) => material.matchReasons?.includes(reason));
  const TypeIcon = typeMeta.Icon;
  const previewTitle = material.contentType === "poll"
    ? material.preview.pollQuestion
    : material.contentType === "location"
      ? material.preview.locationTitle
      : material.contentType === "audio" || material.contentType === "voice"
        ? material.preview.mediaTitle
        : null;
  const duration = durationLabel(material.preview.duration);
  // Excerpts usually begin with the title shown right above them; don't repeat it.
  const excerpt = useMemo(() => {
    const value = material.excerpt?.trim() ?? "";
    const title = material.title.replace(/[\u200B-\u200D\uFEFF]/gu, "").trim();
    const clean = value.replace(/^[\u200B-\u200D\uFEFF]+/u, "");
    return title && clean.startsWith(title) ? clean.slice(title.length).replace(/^[\s.,:;։՝-]+/u, "") || null : value || null;
  }, [material.excerpt, material.title]);
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


  return (
    <li className="animate-glass-enter" data-material-id={material.id}>
      <div className="relative">
        <Link
          className={`${interactiveGlassCard} grid items-start gap-[13px] text-inherit no-underline active:scale-[.992] ${variant === "text" ? "grid-cols-1 px-[16px] pt-[14px] pb-[52px]" : variant === "video" ? "grid-cols-1 gap-[11px] p-[10px] pb-[52px]" : "min-h-[122px] grid-cols-[78px_minmax(0,1fr)] px-[12px] pt-[12px] pb-[52px] min-[560px]:grid-cols-[96px_minmax(0,1fr)]"}${isNoteMounted ? " pointer-events-none" : ""}${isOpening ? " border-[rgb(217_181_111/52%)] bg-glass-strong" : ""}`}
          to={targetPath}
          state={material.searchHit ? { searchHit: material.searchHit } : undefined}
          prefetch="intent"
          tabIndex={isNoteMounted ? -1 : undefined}
          aria-hidden={isNoteMounted ? true : undefined}
          aria-busy={isOpening || undefined}
          onClick={(event) => { if (isOpening) event.preventDefault(); }}
        >
        {variant === "video" ? (
          <span className="relative z-1 block aspect-video w-full overflow-hidden rounded-[14px] border border-glass-border bg-[radial-gradient(circle_at_30%_20%,rgb(217_181_111/22%),transparent_55%),linear-gradient(150deg,#2a1633,#120a17)]">
            {material.preview.thumbnailUrl && !thumbnailFailed ? (
              <img className="h-full w-full object-cover opacity-90" src={material.preview.thumbnailUrl} alt="" loading="lazy" decoding="async" onError={() => setThumbnailFailed(true)} onLoad={(event) => { if (isNearlyBlackImage(event.currentTarget)) setThumbnailFailed(true); }} />
            ) : null}
            <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(10_5_14/70%))]" aria-hidden="true" />
            <span className="absolute inset-0 grid place-items-center"><span className="grid size-12 place-items-center rounded-full border border-[rgb(240_211_151/45%)] bg-[rgb(17_8_22/62%)] text-[#f0d397] backdrop-blur-sm"><Play aria-hidden="true" size={20} fill="currentColor" className="translate-x-px" /></span></span>
            {duration ? <span className="absolute right-2 bottom-2 rounded-full bg-[rgb(17_8_22/80%)] px-2 py-1 text-[11px] font-bold text-white tabular-nums">{duration}</span> : null}
          </span>
        ) : variant === "text" ? null : (
          <span className="relative z-1 block aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-glass-border bg-subtle">
            {material.preview.thumbnailUrl && !thumbnailFailed ? (
              <img
                className="h-full w-full object-cover"
                src={material.preview.thumbnailUrl}
                width={material.preview.width ?? 320}
                height={material.preview.height ?? 240}
                sizes="(min-width: 560px) 96px, 78px"
                loading="lazy"
                decoding="async"
                alt=""
                onError={() => setThumbnailFailed(true)}
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-gold"><TypeIcon aria-hidden="true" size={25} strokeWidth={1.55} /></span>
            )}
            {material.contentType === "video" ? <span className="absolute inset-0 grid place-items-center bg-black/15 text-white"><span className="grid size-9 place-items-center rounded-full bg-black/55"><Play aria-hidden="true" size={18} fill="currentColor" /></span></span> : null}
            {material.contentType === "album" ? <span className="absolute right-1.5 bottom-1.5 rounded-full bg-[rgb(17_8_22/78%)] px-2 py-1 text-[10px] font-bold text-white">{material.preview.mediaCount} նկար</span> : null}
            {duration ? <span className="absolute right-1.5 bottom-1.5 rounded-full bg-[rgb(17_8_22/78%)] px-2 py-1 text-[10px] font-bold text-white tabular-nums">{duration}</span> : null}
          </span>
        )}
        <span className="relative z-1 grid min-w-0 gap-[6px]">
          <span className="flex flex-wrap items-center gap-2">
            {variant === "default" || (variant === "text" && material.contentType !== "text" && material.contentType !== typicalType) ? <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(217_181_111/20%)] bg-[rgb(217_181_111/8%)] px-2 py-1 text-[10px] font-bold text-gold-bright"><TypeIcon aria-hidden="true" size={12} />{typeMeta.label}</span> : null}
            {extraMatchReason ? (
              <span className="rounded-full border border-[rgb(123_74_142/22%)] bg-[rgb(123_74_142/9%)] px-2 py-1 text-[10px] font-bold text-plum">
                {matchReasonLabel(extraMatchReason, material)}
              </span>
            ) : null}
            {date ? <span className="text-[11px] font-[700] text-gold">{date}</span> : null}
          </span>
          {material.categoryName ? (
            <span className="text-[11px] font-[780] tracking-[0.56px] text-plum">{material.categoryName}</span>
          ) : null}
          <strong className="line-clamp-2 text-[15px] leading-[21px] [overflow-wrap:anywhere] min-[960px]:text-[16px] min-[960px]:leading-[23px]">{highlightText(previewTitle || material.title, highlightPattern)}</strong>
          {material.searchHit ? (
            <span className="grid gap-1 rounded-[10px] border border-[rgb(217_181_111/15%)] bg-[rgb(217_181_111/6%)] px-2.5 py-2 text-[12px] leading-[1.5] text-muted">
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-gold">{hitSourceLabel(material.searchHit.source)}</span>
              <span className="line-clamp-3 overflow-hidden">{highlightHit(material.searchHit)}</span>
            </span>
          ) : excerpt || material.preview.performer || material.preview.locationSummary ? (
            <span className="line-clamp-3 overflow-hidden text-[12px] leading-[1.5] text-muted">
              {highlightText(excerpt || material.preview.performer || material.preview.locationSummary || "", highlightPattern)}
            </span>
          ) : null}
          {material.personalNote ? (
            <span className="flex items-start gap-[7px] rounded-[11px] border border-[rgb(217_181_111/15%)] bg-[rgb(217_181_111/7%)] px-2.5 py-[9px] text-[12px] leading-[1.45] text-gold-bright [&>svg]:mt-px [&>svg]:shrink-0">
              <StickyNote aria-hidden="true" size={14} strokeWidth={1.8} />
              <span><strong className="font-[760]">Իմ նշումից՝ </strong>{highlightText(material.personalNote, highlightPattern)}</span>
            </span>
          ) : null}
          {isOpening ? <span className="inline-flex items-center gap-2 text-[11px] font-bold text-gold-bright" role="status"><LoaderCircle className="animate-search-spin" aria-hidden="true" size={14} /> Բացվում է…</span> : null}
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
          <ShareButton
            className={`${iconButton} size-[34px] rounded-[11px] bg-nav-glass text-gold`}
            title={material.title}
            text={excerpt ? `${material.title}\n\n${excerpt}` : material.title}
            url={material.telegramUrl}
            pageUrl={typeof window === "undefined" ? targetPath : new URL(targetPath, window.location.origin).toString()}
          />
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
