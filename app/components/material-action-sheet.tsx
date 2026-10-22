import { Bookmark, ExternalLink, Pencil } from "lucide-react";

import { BottomSheet } from "./bottom-sheet";
import { openTelegramPost } from "./material-result-card";
import { ReminderButton } from "./reminder-button";
import { ShareButton } from "./share-button";

const tile = "action-tile flex min-h-[70px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[16px] px-1 text-[11.5px] font-bold no-underline active:scale-[.96] disabled:opacity-60";

/**
 * A material's actions, opened by holding its card: save, remind, open in Telegram, share, and
 * edit the personal note for saved materials.
 */
export function MaterialActionSheet({ open, onClose, material, canSave, isSaved, isSaving, allowNoteEditing, onBookmark, onEditNote, shareText, pageUrl }: {
  open: boolean;
  onClose: () => void;
  material: { id: string; title: string; telegramUrl: string };
  canSave: boolean;
  isSaved: boolean;
  isSaving: boolean;
  allowNoteEditing: boolean;
  onBookmark: () => void;
  onEditNote: () => void;
  shareText: string;
  pageUrl: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Գործողություններ" className="gap-3 p-4">
      <strong className="line-clamp-2 px-1 text-center font-noto text-[15px] leading-snug text-ink">{material.title}</strong>
      <div className={`grid gap-2 ${canSave ? "grid-cols-4" : "grid-cols-2"}`}>
        {canSave ? (
          <button className={tile} type="button" disabled={isSaving} onClick={onBookmark}>
            <Bookmark aria-hidden="true" size={20} strokeWidth={1.9} fill={isSaved ? "currentColor" : "none"} />
            <span>{isSaved ? "Հանել" : "Պահել"}</span>
          </button>
        ) : null}
        {canSave ? <ReminderButton className={tile} materialId={material.id} title={material.title} label /> : null}
        <a className={tile} href={material.telegramUrl} target="_blank" rel="noreferrer" onClick={(event) => { openTelegramPost(event); onClose(); }}>
          <ExternalLink aria-hidden="true" size={20} strokeWidth={1.9} />
          <span>Telegram</span>
        </a>
        <ShareButton className={tile} title={material.title} text={shareText} pageUrl={pageUrl} label />
      </div>
      {allowNoteEditing && isSaved ? (
        <button className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-glass-border bg-subtle text-[13px] font-semibold text-ink" type="button" onClick={onEditNote}>
          <Pencil aria-hidden="true" size={16} /> Խմբագրել նշումը
        </button>
      ) : null}
      {!canSave ? <p className="m-0 text-center text-[12px] text-muted">Պահելու և հիշեցնելու համար մուտք գործեք «Իմ անկյունը» բաժնից։</p> : null}
    </BottomSheet>
  );
}
