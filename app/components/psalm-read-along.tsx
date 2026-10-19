import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A psalm's text, verse by verse, following its recording: while the audio plays, the verse
 * being read is lit and the others dim. There are no timestamps, so the place is estimated from
 * how far the recording has played, weighting each verse by its length; tapping a verse jumps the
 * recording there.
 */
export function PsalmReadAlong({ text, superscription }: { text: string; superscription: boolean }) {
  const lines = useMemo(() => text.split("\n").map((line) => line.trim()).filter(Boolean), [text]);
  const starts = useMemo(() => {
    const total = lines.reduce((sum, line) => sum + line.length, 0) || 1;
    let running = 0;
    return lines.map((line) => { const start = running / total; running += line.length; return start; });
  }, [lines]);
  const [active, setActive] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  useEffect(() => {
    const update = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audioRef.current = audio;
      if (audio.paused && event.type !== "seeked") { if (event.type === "pause" || event.type === "ended") setActive(-1); return; }
      const fraction = audio.currentTime / audio.duration;
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= fraction) index += 1;
      setActive((current) => {
        if (current !== index && !audio.paused) {
          const element = lineRefs.current[index];
          const rect = element?.getBoundingClientRect();
          // Keep the verse in view without yanking the page while the reader looks elsewhere.
          if (element && rect && (rect.top < 80 || rect.bottom > window.innerHeight - 120)) element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return index;
      });
    };
    for (const type of ["timeupdate", "play", "pause", "ended", "seeked"]) document.addEventListener(type, update, true);
    return () => { for (const type of ["timeupdate", "play", "pause", "ended", "seeked"]) document.removeEventListener(type, update, true); };
  }, [starts]);

  const seek = (index: number) => {
    const audio = audioRef.current ?? document.querySelector("audio");
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = starts[index] * audio.duration;
    void audio.play().catch(() => undefined);
  };

  const following = active >= 0;
  return (
    <div className="psalm-lines grid gap-1">
      {lines.map((line, index) => (
        <p
          key={index}
          ref={(element) => { lineRefs.current[index] = element; }}
          className={`m-0 cursor-pointer rounded-[10px] px-2 py-0.5 -mx-2 transition-[color,background-color,opacity] duration-500 ${superscription && index === 0 ? "psalm-superscription mb-3 border-b border-[rgb(217_181_111/32%)] pb-3 text-center" : ""} ${following ? index === active ? "bg-[rgb(217_181_111/16%)] opacity-100" : "opacity-45" : ""}`}
          onClick={() => seek(index)}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
