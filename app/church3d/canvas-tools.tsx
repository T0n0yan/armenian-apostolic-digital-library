// Կոճակներ 3D-ի (canvas-ի) ներսում՝ անկյուններում, որ աչքը միաժամանակ տեսնի և՛ մոդելը, և՛ կոճակը։
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export const canvasButton = "grid size-9 cursor-pointer place-items-center rounded-full border border-edge bg-[var(--sheet-bg)] text-gold-bright shadow-[0_1px_4px_rgb(0_0_0/25%)] disabled:cursor-default disabled:opacity-40";
export const canvasPill = "flex gap-1 rounded-button border border-edge bg-[var(--sheet-bg)] p-1 shadow-[0_1px_4px_rgb(0_0_0/25%)]";
export const canvasSegment = (on: boolean) => `min-h-8 cursor-pointer rounded-[8px] px-2.5 text-[12.5px] font-bold ${on ? "bg-[rgb(217_181_111/18%)] text-gold-bright shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : "text-muted"}`;

/** Անկյուն canvas-ի ներսում (կոճակների խումբ)։ */
export function Corner({ at, children }: { at: "top-left" | "top-right" | "bottom-left" | "bottom-right"; children: ReactNode }) {
  const place = { "top-left": "top-2 left-2", "top-right": "top-2 right-2", "bottom-left": "bottom-2 left-2", "bottom-right": "bottom-2 right-2" }[at];
  return <div className={`absolute ${place} z-[2] flex flex-wrap items-center gap-1.5`}>{children}</div>;
}

/** Ամբողջ էկրան՝ canvas-ի քարտի համար (Safari-ի iPhone-ում չկա, կոճակը չի երևում)։ */
export function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setSupported(Boolean(document.fullscreenEnabled));
    const update = () => setOn(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [target]);
  if (!supported) return null;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen().catch(() => {});
  };
  return (
    <button type="button" className={canvasButton} aria-label={on ? "Դուրս գալ ամբողջ էկրանից" : "Ամբողջ էկրան"} title={on ? "Դուրս գալ ամբողջ էկրանից" : "Ամբողջ էկրան"} onClick={toggle}>
      {on ? <Minimize2 aria-hidden="true" size={16} /> : <Maximize2 aria-hidden="true" size={16} />}
    </button>
  );
}
