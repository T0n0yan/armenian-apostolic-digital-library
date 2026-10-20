import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";

const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;

/**
 * Press-and-hold (or right-click) on an element: calls `onHold` and swallows the click that
 * follows, so a held card opens its actions instead of the page.
 */
export function useLongPress(onHold: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => { window.clearTimeout(timer.current); start.current = null; }, []);
  const fire = useCallback(() => {
    fired.current = true;
    navigator.vibrate?.(12);
    onHold();
  }, [onHold]);

  const handlers = useMemo(() => ({
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fire, HOLD_MS);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      cancel();
      if (!fired.current) fire();
    },
  }), [cancel, fire]);

  /** True (once) when the click that just happened ended a hold. */
  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { handlers, consumeClick };
}
