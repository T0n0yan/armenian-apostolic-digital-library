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

/**
 * Ամբողջ էկրան՝ canvas-ի քարտի համար։ Որտեղ բրաուզերը չունի Fullscreen API (iPhone-ի Safari), քարտը CSS-ով
 * ծածկում է ամբողջ էջը (`.church3d-full`), էջի ոլորումը կանգնում է, Escape-ը կամ կոճակը վերադարձնում են։
 */
export function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const update = () => setOn(Boolean(target.current?.classList.contains("church3d-full")) || document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [target]);
  useEffect(() => {
    const element = target.current;
    if (!on || !element?.classList.contains("church3d-full")) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") toggle(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  // Էջից դուրս գալիս (քարտը անհետանում է) էջի ոլորումը վերադարձնել։
  useEffect(() => () => { document.documentElement.classList.remove("church3d-lock"); }, []);
  const toggle = () => {
    const element = target.current;
    if (!element) return;
    if (element.classList.contains("church3d-full")) {
      element.classList.remove("church3d-full");
      document.documentElement.classList.remove("church3d-lock");
      setOn(false);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (document.fullscreenEnabled && element.requestFullscreen) {
      void element.requestFullscreen().catch(() => fallback(element));
    } else {
      fallback(element);
    }
  };
  const fallback = (element: HTMLElement) => {
    element.classList.add("church3d-full");
    document.documentElement.classList.add("church3d-lock");
    setOn(true);
  };
  return (
    <button type="button" className={canvasButton} aria-label={on ? "Դուրս գալ ամբողջ էկրանից" : "Ամբողջ էկրան"} title={on ? "Դուրս գալ ամբողջ էկրանից" : "Ամբողջ էկրան"} onClick={toggle}>
      {on ? <Minimize2 aria-hidden="true" size={16} /> : <Maximize2 aria-hidden="true" size={16} />}
    </button>
  );
}
