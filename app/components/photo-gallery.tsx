import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A place's photos opened over the page: one at a time, whole, on a dark backdrop. Arrows, a swipe
 * or the keyboard move between them; ✕, Esc or a tap beside the photo closes.
 */
export function PhotoGallery({ photos, start, alt, onClose }: { photos: string[]; start: number; alt: string; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const count = photos.length;
  const go = (by: number) => setIndex((current) => (current + by + count) % count);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const round = "grid size-11 cursor-pointer place-items-center rounded-full border border-white/20 bg-[rgb(17_8_22/72%)] text-white backdrop-blur-md";
  return createPortal(
    <div className="fixed inset-0 z-[2100] grid place-items-center bg-[rgb(8_4_10/94%)] p-[max(12px,env(safe-area-inset-top))_12px_max(12px,env(safe-area-inset-bottom))]"
      role="dialog" aria-modal="true" aria-label={`${alt}՝ նկարներ`} onClick={onClose}
      onTouchStart={(event) => { touch.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const from = touch.current;
        const to = event.changedTouches[0]?.clientX;
        touch.current = null;
        if (from === null || to === undefined || Math.abs(to - from) < 40 || count < 2) return;
        go(to < from ? 1 : -1);
      }}>
      <img key={photos[index]} className="max-h-full max-w-full rounded-[10px] object-fit motion-safe:animate-[glass-enter_250ms_ease-out]" src={photos[index]} alt={`${alt}, նկար ${index + 1}`} onClick={(event) => event.stopPropagation()} />
      <button className={`${round} absolute top-[max(12px,env(safe-area-inset-top))] right-3`} type="button" onClick={onClose} aria-label="Փակել" autoFocus><X aria-hidden="true" size={20} /></button>
      {count > 1 ? (
        <>
          <button className={`${round} absolute top-1/2 left-3 -translate-y-1/2`} type="button" onClick={(event) => { event.stopPropagation(); go(-1); }} aria-label="Նախորդ նկարը"><ChevronLeft aria-hidden="true" size={22} /></button>
          <button className={`${round} absolute top-1/2 right-3 -translate-y-1/2`} type="button" onClick={(event) => { event.stopPropagation(); go(1); }} aria-label="Հաջորդ նկարը"><ChevronRight aria-hidden="true" size={22} /></button>
          <span className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-[rgb(17_8_22/72%)] px-3 py-1 text-[13px] font-semibold text-white tabular-nums" aria-live="polite">{index + 1} / {count}</span>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
