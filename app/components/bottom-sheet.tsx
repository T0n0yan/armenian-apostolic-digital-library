import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 380;

/**
 * A sheet that slides up from the bottom over a dimmed page and slides back down when closed
 * (it stays mounted until its exit animation ends). Escape or a tap outside closes it.
 */
export function BottomSheet({ open, onClose, label, children, className = "" }: {
  open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string;
}) {
  const [rendered, setRendered] = useState(open);
  const [phase, setPhase] = useState<"in" | "out">("in");

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

  if (!rendered || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid items-end justify-items-center p-3 pb-[calc(var(--tg-inset-bottom,0px)+12px)]" role="dialog" aria-label={label}>
      <button className={`sheet-scrim absolute inset-0 cursor-default border-0 bg-[rgb(20_10_24/40%)] p-0`} data-phase={phase} type="button" aria-label="Փակել" onClick={onClose} />
      <div className={`install-toast relative grid max-h-[calc(100svh-24px)] w-full max-w-[440px] overflow-y-auto rounded-[22px] border border-glass-border bg-[var(--page-bg)] shadow-[0_24px_60px_rgb(20_8_24/40%)] ${className}`} data-phase={phase}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
