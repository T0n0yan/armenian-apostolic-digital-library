import { useEffect, useRef, type RefObject } from "react";

/**
 * Փոքր պատուհաններ և տոստեր. ցանկացած հպում կամ սեղմում դրանցից դուրս (և Escape-ը) փակում է դրանք։
 * Բացվելու հենց պահին եղած հպումը հաշվի չի առնվում։
 */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const onDown = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close.current(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    const timer = window.setTimeout(() => { document.addEventListener("pointerdown", onDown, true); document.addEventListener("keydown", onKey); }, 0);
    return () => { window.clearTimeout(timer); document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [active, ref]);
}
