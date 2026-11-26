import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useScrollLock } from "../utils/scroll-lock";

const EXIT_MS = 380;

/**
 * A sheet that slides up from the bottom over a dimmed page and slides back down when closed
 * (it stays mounted until its exit animation ends). Escape or a tap outside closes it.
 */
export function BottomSheet({ open, onClose, label, children, className = "", swipeToClose = false }: {
  open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string;
  /** Վերևում բռնակ. բռնակը (կամ `data-sheet-drag` տարրը) ներքև քաշելով պատուհանը փակվում է։ */
  swipeToClose?: boolean;
}) {
  const [rendered, setRendered] = useState(open);
  const [phase, setPhase] = useState<"in" | "out">("in");
  // Մինչ պատուհանը բաց է, հետևի էջը չի ոլորվում։
  useScrollLock(open);

  useEffect(() => {
    if (open) { setRendered(true); setPhase("in"); return; }
    if (!rendered) return;
    setPhase("out");
    const timer = window.setTimeout(() => setRendered(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  // Ստեղնաշար. բացվելիս focus-ը մտնում է պատուհան, Tab/Shift+Tab-ը մնում է ներսում, փակվելիս
  // վերադառնում է բացող կոճակին։
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !rendered) return;
    const element = panel.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]'))
      .filter((item) => item.tabIndex >= 0 && item.getClientRects().length > 0);
    if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); element.focus(); return; }
      const inside = element.contains(document.activeElement) && document.activeElement !== element;
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, rendered]);

  // Ներքև քաշել՝ փակելու համար. `translate`-ը չի խառնվում բացվելու անիմացիայի `transform`-ին։
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ start: number; id: number } | null>(null);
  useEffect(() => { if (open) setDragY(0); }, [open]);
  const dragHandlers = swipeToClose ? {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!(event.target as Element).closest("[data-sheet-drag]") || (event.target as Element).closest("button, a")) return;
      drag.current = { start: event.clientY, id: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (drag.current?.id !== event.pointerId) return;
      setDragY(Math.max(0, event.clientY - drag.current.start));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null;
      if (dragY > 90) onClose(); else setDragY(0);
    },
    onPointerCancel: () => { drag.current = null; setDragY(0); },
  } : {};

  if (!rendered || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] grid items-end justify-items-center p-3 pb-[calc(var(--tg-inset-bottom,0px)+12px)]" role="dialog" aria-modal="true" aria-label={label}>
      <button className={`sheet-scrim absolute inset-0 cursor-default border-0 bg-[rgb(20_10_24/40%)] p-0`} data-phase={phase} type="button" aria-label="Փակել" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className={`install-toast relative grid outline-none max-h-[calc(100svh-24px)] w-full max-w-[440px] overflow-y-auto paper-sheet rounded-panel border ${className}`} data-phase={phase}
        style={swipeToClose ? { translate: `0 ${dragY}px`, transition: drag.current ? "none" : "translate 220ms ease-out" } : undefined} {...dragHandlers}>
        {swipeToClose ? <span className="-mt-1 mb-0.5 flex cursor-grab touch-none justify-center py-1.5" data-sheet-drag aria-hidden="true"><span className="h-1 w-10 rounded-full bg-[rgb(217_181_111/45%)]" /></span> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
