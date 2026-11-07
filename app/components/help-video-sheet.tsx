import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { HelpVideo } from "../utils/help-videos";

/**
 * Օգնության տեսանյութի պատուհանը. տեսանյութ, վերնագիր, «3 / 13», կետեր, Նախորդը/Հաջորդը։
 * Օգտագործում են «Օգնություն» էջը և առաջին այցի ուղեցույցը (mode="onboarding"՝ «Բաց թողնել» և վերջում «Սկսել»)։
 */
export function HelpVideoSheet({ videos, index, onIndex, onClose, mode = "help" }: {
  videos: HelpVideo[]; index: number; onIndex: (index: number) => void; onClose: () => void; mode?: "help" | "onboarding";
}) {
  const video = videos[index];
  const player = useRef<HTMLVideoElement>(null);
  const last = index === videos.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && !last) onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [index, last, onClose, onIndex]);

  // Նոր տեսանյութը սկսվում է սկզբից (ձայն չունի, ուստի կարող է ինքն իրեն սկսել)
  useEffect(() => { player.current?.play().catch(() => undefined); }, [index]);

  if (!video?.url) return null;
  const step = "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border text-[14px] font-bold disabled:cursor-default disabled:opacity-35";
  return (
    <div className="fixed inset-0 z-[2100] grid place-items-center bg-[rgb(20_12_6/62%)] p-3 backdrop-blur-[6px] animate-glass-enter" role="dialog" aria-modal="true" aria-label={video.title}
      onClick={(event) => { if (event.target === event.currentTarget && mode === "help") onClose(); }}>
      <div className="grid w-full max-w-[400px] gap-3 rounded-[24px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-3 shadow-[0_24px_60px_rgb(20_10_4/45%)]">
        <div className="flex items-start gap-2 px-1 pt-1">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[11.5px] font-bold tracking-[1.2px] text-gold uppercase">{mode === "onboarding" ? "Ինչպես օգտվել կայքից" : "Օգնություն"}</span>
            <strong className="font-noto text-[16.5px] leading-snug text-ink">{video.title}</strong>
          </div>
          {mode === "onboarding" ? (
            <button className="min-h-9 shrink-0 cursor-pointer rounded-full border border-glass-border bg-subtle px-3 text-[13px] font-bold text-muted" type="button" onClick={onClose}>Բաց թողնել</button>
          ) : (
            <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={18} /></button>
          )}
        </div>
        {/* Շրջանակը ունի կայուն չափ (9:16, էկրանի բարձրության 62%-ը), որ տեսանյութը բեռնվելիս
            պատուհանը չփոքրանա ու չմեծանա. տեսանյութը լցվում է շրջանակի մեջ։ */}
        <div className="relative mx-auto aspect-[9/16] h-[min(62svh,640px)] max-w-full overflow-hidden rounded-[16px] bg-[#e9dcc0]">
          <video key={video.url} ref={player} className="absolute inset-0 block size-full object-contain"
            src={video.url} controls autoPlay muted playsInline preload="auto" />
        </div>
        {/* Քանի տեսանյութ կա և որերորդն է */}
        <div className="grid justify-items-center gap-1.5">
          <span className="text-[13px] font-bold text-muted tabular-nums">{index + 1} / {videos.length}</span>
          <div className="flex flex-wrap justify-center gap-1.5" aria-hidden="true">
            {videos.map((item, dot) => (
              <button key={item.id} type="button" tabIndex={-1} onClick={() => onIndex(dot)}
                className={`h-2 cursor-pointer rounded-full border-0 p-0 transition-[width,background] duration-200 ${dot === index ? "w-5 bg-gold" : "w-2 bg-[rgb(160_130_90/30%)]"}`} />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={`${step} border-glass-border bg-subtle text-ink`} type="button" disabled={index === 0} onClick={() => onIndex(index - 1)}>
            <ChevronLeft aria-hidden="true" size={18} /> Նախորդը
          </button>
          {last ? (
            <button className={`${step} border-[rgb(217_181_111/55%)] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" onClick={onClose}>
              {mode === "onboarding" ? "Սկսել" : "Փակել"}
            </button>
          ) : (
            <button className={`${step} border-[rgb(217_181_111/55%)] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" onClick={() => onIndex(index + 1)}>
              Հաջորդը <ChevronRight aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
