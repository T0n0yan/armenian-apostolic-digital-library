import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { lockScroll } from "../utils/scroll-lock";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN = 1;
const MAX = 4;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * A place's photos opened over the page: one at a time, whole, on a dark backdrop.
 * Flex-centering (not grid) so every photo fits fully — a percentage max-height does not
 * resolve against an auto grid-track, which left tall photos overflowing and cropped from the top.
 * Arrows, a swipe or the keyboard move between photos; «＋/−», the wheel, a double-tap or a pinch
 * zoom in and let you drag the photo; ✕, Esc or a tap beside the photo closes.
 */
export function PhotoGallery({ photos, start, alt, onClose }: { photos: string[]; start: number; alt: string; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Մատով թերթելիս նկարը հետևում է մատին (px), բաց թողնելիս՝ հաջորդը կամ ետ իր տեղը։
  const [swipe, setSwipe] = useState(0);
  const count = photos.length;
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  // Active pointers (one → drag/swipe, two → pinch) and the gesture's running state.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; baseOffset: { x: number; y: number }; baseScale: number; startDist: number; moved: boolean; pinched?: boolean }>(
    { startX: 0, startY: 0, baseOffset: { x: 0, y: 0 }, baseScale: 1, startDist: 0, moved: false },
  );

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);
  const go = useCallback((by: number) => { reset(); setIndex((current) => (current + by + count) % count); }, [count, reset]);

  // How far the photo may be dragged at the current scale, so it can't be lost off-screen.
  const limit = useCallback((next: number) => {
    const box = image.current?.getBoundingClientRect();
    const area = stage.current?.getBoundingClientRect();
    if (!box || !area) return { x: 0, y: 0 };
    // box-ը արդեն `scale`-ով մեծացված է. չափը `next`-ի դեպքում՝ box / scale * next
    // (առաջ scale-ը երկու անգամ էր բաժանվում, և սահմանը 0 էր դառնում՝ նկարը չէր շարժվում)։
    const w = (box.width / scale) * next;
    const h = (box.height / scale) * next;
    return { x: Math.max(0, (w - area.width) / 2), y: Math.max(0, (h - area.height) / 2) };
  }, [scale]);

  const zoomTo = useCallback((next: number) => {
    const target = clamp(next, MIN, MAX);
    setScale(target);
    if (target === 1) setOffset({ x: 0, y: 0 });
    else setOffset((current) => { const max = limit(target); return { x: clamp(current.x, -max.x, max.x), y: clamp(current.y, -max.y, max.y) }; });
  }, [limit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "+" || event.key === "=") zoomTo(scale + 0.5);
      else if (event.key === "-") zoomTo(scale - 0.5);
    };
    const unlock = lockScroll();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); unlock(); };
  }, [onClose, go, zoomTo, scale]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = { startX: event.clientX, startY: event.clientY, baseOffset: offset, baseScale: scale, startDist: pointers.current.size === 2 ? dist() : 0, moved: false, pinched: pointers.current.size === 2 };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      // Pinch: scale from the two-finger spread.
      const start = gesture.current.startDist || dist();
      zoomTo(gesture.current.baseScale * (dist() / start));
      gesture.current.moved = true;
      return;
    }
    const dx = event.clientX - gesture.current.startX;
    const dy = event.clientY - gesture.current.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gesture.current.moved = true;
    if (scale === 1 && count > 1) { setSwipe(dx); return; }
    if (scale > 1) {
      const max = limit(scale);
      setOffset({ x: clamp(gesture.current.baseOffset.x + dx, -max.x, max.x), y: clamp(gesture.current.baseOffset.y + dy, -max.y, max.y) });
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) {
      // Երկու մատից մեկը բաց թողնվեց. մնացած մատը շարունակում է տեղաշարժը իր դիրքից՝ առանց ցատկի։
      const [rest] = [...pointers.current.values()];
      gesture.current = { ...gesture.current, startX: rest.x, startY: rest.y, baseOffset: offset, baseScale: scale, startDist: 0, pinched: true };
      return;
    }
    // pointercancel-ը կարող է գալ առանց նոր կոորդինատի. այդ դեպքում վերջին հայտնի շեղումն ենք վերցնում։
    const dx = event.type === "pointercancel" ? swipe : event.clientX - gesture.current.startX;
    setSwipe(0);
    // Բնական չափում հորիզոնական սահեցումը (≥ 50px կամ էկրանի 15%-ը) փոխում է նկարը։
    const enough = Math.abs(dx) > Math.min(50, window.innerWidth * 0.15);
    if (scale === 1 && gesture.current.moved && !gesture.current.pinched && enough && count > 1) go(dx < 0 ? 1 : -1);
  };

  const round = "grid size-11 cursor-pointer place-items-center rounded-full border border-white/20 bg-[rgb(17_8_22/72%)] text-white backdrop-blur-md disabled:cursor-default disabled:opacity-40";
  const arrow = "grid size-10 cursor-pointer place-items-center rounded-full text-white active:bg-white/15";
  return createPortal(
    <div className="fixed inset-0 z-[2100] flex items-center justify-center overflow-hidden bg-[rgb(8_4_10/94%)] p-[max(12px,env(safe-area-inset-top))_12px_max(12px,env(safe-area-inset-bottom))]"
      role="dialog" aria-modal="true" aria-label={`${alt}՝ նկարներ`}
      onClick={(event) => { if (event.target === event.currentTarget && scale === 1) onClose(); }}>
      {/* The photo stage fills the screen; the image inside is contained whole, then transformed for zoom/pan. */}
      <div ref={stage} className="flex h-full w-full touch-none items-center justify-center pb-[64px] min-[768px]:px-[64px]"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => zoomTo(scale > 1 ? 1 : 2.5)}
        onWheel={(event) => { event.preventDefault(); zoomTo(scale - Math.sign(event.deltaY) * 0.3); }}>
        <img ref={image} key={photos[index]} draggable={false}
          className="max-h-full max-w-full rounded-control object-contain select-none will-change-transform motion-safe:animate-[glass-enter_250ms_ease-out]"
          style={{ transform: `translate(${offset.x + swipe}px, ${offset.y}px) scale(${scale})`, opacity: swipe ? Math.max(0.4, 1 - Math.abs(swipe) / 600) : 1, cursor: scale > 1 ? "grab" : "zoom-in", transition: pointers.current.size ? "none" : "transform .18s ease, opacity .18s ease" }}
          src={photos[index]} alt={`${alt}, նկար ${index + 1}`} onClick={(event) => event.stopPropagation()} />
      </div>
      <button className={`${round} absolute top-[max(12px,env(safe-area-inset-top))] right-3`} type="button" onClick={onClose} aria-label="Փակել" autoFocus><X aria-hidden="true" size={20} /></button>
      {/* Ներքևի շերտ. հեռախոսում սլաքները և համարը միասին են (նկարի վրա չեն), խոշորացումը՝ աջում։ */}
      <div className="pointer-events-none absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-center">
        {count > 1 ? (
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-[rgb(17_8_22/72%)] p-1 backdrop-blur-md">
            <button className={arrow} type="button" onClick={(event) => { event.stopPropagation(); go(-1); }} aria-label="Նախորդ նկարը"><ChevronLeft aria-hidden="true" size={20} /></button>
            <span className="min-w-[52px] text-center text-[13.5px] font-semibold text-white tabular-nums" aria-live="polite">{index + 1} / {count}</span>
            <button className={arrow} type="button" onClick={(event) => { event.stopPropagation(); go(1); }} aria-label="Հաջորդ նկարը"><ChevronRight aria-hidden="true" size={20} /></button>
          </div>
        ) : null}
        <div className="pointer-events-auto absolute right-0 flex gap-2 max-[767px]:hidden">
          <button className={round} type="button" onClick={() => zoomTo(scale - 0.5)} disabled={scale <= MIN} aria-label="Փոքրացնել"><Minus aria-hidden="true" size={20} /></button>
          <button className={round} type="button" onClick={() => zoomTo(scale + 0.5)} disabled={scale >= MAX} aria-label="Խոշորացնել"><Plus aria-hidden="true" size={20} /></button>
        </div>
      </div>
      {/* Մեծ էկրանին՝ նաև կողային սլաքներ, նկարից դուրս (stage-ը կողքերից 64px տեղ է թողնում)։ */}
      {count > 1 ? (
        <>
          <button className={`${round} absolute top-1/2 left-3 -translate-y-1/2 max-[767px]:hidden`} type="button" onClick={(event) => { event.stopPropagation(); go(-1); }} aria-label="Նախորդ նկարը"><ChevronLeft aria-hidden="true" size={22} /></button>
          <button className={`${round} absolute top-1/2 right-3 -translate-y-1/2 max-[767px]:hidden`} type="button" onClick={(event) => { event.stopPropagation(); go(1); }} aria-label="Հաջորդ նկարը"><ChevronRight aria-hidden="true" size={22} /></button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
