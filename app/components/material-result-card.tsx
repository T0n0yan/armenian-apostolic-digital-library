import { Bookmark, ExternalLink } from "lucide-react";
import { memo, type MouseEvent } from "react";

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
  };
  canSave: boolean;
  isSaved: boolean;
  isSaving?: boolean;
  onSavedChange: (materialId: string, saved: boolean) => void;
};

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
  isSaved,
  isSaving = false,
  onSavedChange,
}: MaterialResultCardProps) {
  const date = formatArmenianDate(material.dateValue);

  return (
    <li className="material-card-shell">
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
          <strong>{material.title}</strong>
          {material.excerpt ? (
            <span className="material-excerpt">{material.excerpt}</span>
          ) : null}
          {material.mediaTypes.length > 0 ? (
            <span className="material-media-list">
              {material.mediaTypes.map((mediaType) => (
                <span key={mediaType}>{mediaLabels[mediaType] ?? mediaType}</span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="material-open" aria-hidden="true">
          <ExternalLink size={17} strokeWidth={1.9} />
        </span>
      </a>
      {canSave ? (
        <button
          className={`material-save${isSaved ? " is-saved" : ""}`}
          type="button"
          disabled={isSaving}
          onClick={() => onSavedChange(material.id, !isSaved)}
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
    </li>
  );
});
