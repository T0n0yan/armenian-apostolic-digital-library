import { Check, PencilLine, RotateCcw, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Timings = Array<number | null>;

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function currentAudio() {
  return document.querySelector<HTMLAudioElement>("audio");
}

/**
 * A psalm's text, verse by verse, following its recording: while the audio plays, the verse
 * being read is lit and the others dim, and tapping a verse jumps the recording there.
 *
 * Where an editor has marked when each verse begins (marking mode), those times are used;
 * otherwise the place is estimated from how far the recording has played, weighting each verse
 * by its length.
 */
export function PsalmReadAlong({ text, superscription, materialId, timings: savedTimings, canMark = false }: {
  text: string; superscription: boolean; materialId: string; timings?: Timings | null; canMark?: boolean;
}) {
  const lines = useMemo(() => text.split("\n").map((line) => line.trim()).filter(Boolean), [text]);
  // Only numbered verses are marked and followed ("1 Երանելի է…"); the title, the psalm number and
  // the superscription are not. Numbering may start at 2; an unnumbered line after a verse belongs to it.
  const { verseOf, verseCount, verseNumbers } = useMemo(() => {
    const map: number[] = [];
    const numbers: number[] = [];
    let current = -1;
    for (const line of lines) {
      const number = /^(\d{1,3})(?=[\s.)։])/u.exec(line)?.[1];
      if (number) { current += 1; numbers.push(Number(number)); }
      map.push(current);
    }
    return { verseOf: map, verseCount: current + 1, verseNumbers: numbers };
  }, [lines]);
  const [timings, setTimings] = useState<Timings | null>(savedTimings && savedTimings.length === verseCount ? savedTimings : null);
  const estimated = useMemo(() => {
    const lengths = Array.from({ length: verseCount }, () => 0);
    lines.forEach((line, index) => { if (verseOf[index] >= 0) lengths[verseOf[index]] += line.length; });
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
    let running = 0;
    return lengths.map((length) => { const start = running / total; running += length; return start; });
  }, [lines, verseCount, verseOf]);
  const [active, setActive] = useState(-1);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  // Marking mode (editors): each tap of "next verse" records when the next verse begins.
  const [marking, setMarking] = useState(false);
  const [draft, setDraft] = useState<Timings>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const nextIndex = draft.findIndex((value) => value === null);

  const indexAt = useCallback((audio: HTMLAudioElement) => {
    const marks = marking ? draft : timings;
    if (marks && marks.some((value) => value !== null)) {
      let index = -1;
      marks.forEach((start, i) => { if (start !== null && start <= audio.currentTime + 0.05) index = i; });
      return Math.max(0, index);
    }
    const fraction = audio.currentTime / audio.duration;
    let index = 0;
    while (index + 1 < estimated.length && estimated[index + 1] <= fraction) index += 1;
    return index;
  }, [draft, estimated, marking, timings]);

  useEffect(() => {
    const update = (event: Event) => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if (audio.paused && event.type !== "seeked") { if (!marking && (event.type === "pause" || event.type === "ended")) setActive(-1); return; }
      const index = indexAt(audio);
      setActive((current) => {
        if (current !== index && !audio.paused) {
          const element = lineRefs.current[verseOf.indexOf(index)];
          const rect = element?.getBoundingClientRect();
          // Keep the verse in view without yanking the page while the reader looks elsewhere.
          if (element && rect && (rect.top < 80 || rect.bottom > window.innerHeight - 160)) element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return index;
      });
    };
    const types = ["timeupdate", "play", "pause", "ended", "seeked"];
    for (const type of types) document.addEventListener(type, update, true);
    return () => { for (const type of types) document.removeEventListener(type, update, true); };
  }, [indexAt, marking, verseOf]);

  const startMarking = () => {
    setDraft(timings ? [...timings] : Array.from({ length: verseCount }, () => null));
    setMessage(null);
    setMarking(true);
    const audio = currentAudio();
    if (audio) { audio.currentTime = 0; void audio.play().catch(() => undefined); }
  };

  const markNext = useCallback(() => {
    const audio = currentAudio();
    if (!audio) return;
    setDraft((current) => {
      const index = current.findIndex((value) => value === null);
      if (index < 0) return current;
      const next = [...current];
      next[index] = Math.round(audio.currentTime * 100) / 100;
      return next;
    });
  }, []);

  const undo = () => {
    setDraft((current) => {
      let last = -1;
      current.forEach((value, index) => { if (value !== null) last = index; });
      if (last < 0) return current;
      const next = [...current];
      next[last] = null;
      const audio = currentAudio();
      if (audio) audio.currentTime = Math.max(0, (next.slice(0, last).filter((value): value is number => value !== null).pop() ?? 0));
      return next;
    });
  };

  // Space marks the next verse on a keyboard.
  useEffect(() => {
    if (!marking) return;
    const onKey = (event: KeyboardEvent) => { if (event.code === "Space" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); markNext(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markNext, marking]);

  const save = async (starts: Timings | null) => {
    setSaving(true);
    const response = await fetch("/api/psalm-timings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, starts }) }).catch(() => null);
    setSaving(false);
    if (!response?.ok) { setMessage("Չհաջողվեց պահել։ Փորձեք նորից։"); return; }
    setTimings(starts);
    setMarking(false);
    setMessage(starts ? "Պահված է։ Հիմա տեքստը կհետևի ձայնին ճշգրիտ։" : "Նշումները ջնջված են։");
  };

  const onLineClick = (lineIndex: number) => {
    const index = verseOf[lineIndex];
    if (index < 0) return;
    const audio = currentAudio();
    if (!audio || !Number.isFinite(audio.duration)) return;
    if (marking) {
      // While marking, a tap sets this verse's start to the current moment (to fix one mark).
      setDraft((current) => { const next = [...current]; next[index] = Math.round(audio.currentTime * 100) / 100; return next; });
      return;
    }
    const start = timings?.[index];
    audio.currentTime = typeof start === "number" ? start : estimated[index] * audio.duration;
    void audio.play().catch(() => undefined);
  };

  const following = active >= 0;
  const button = "inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border px-3 text-[12.5px] font-bold disabled:opacity-50";
  return (
    <div className="grid gap-3">
      {canMark && !marking ? (
        <div className="flex flex-wrap items-center justify-end gap-2 font-sans">
          <span className="mr-auto text-[11.5px] text-muted">{timings ? "Համարների ժամերը նշված են" : "Համարների ժամերը նշված չեն"}</span>
          {timings ? <button className={`${button} border-glass-border bg-transparent text-muted`} type="button" disabled={saving} onClick={() => save(null)}>Ջնջել</button> : null}
          <button className={`${button} border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright`} type="button" onClick={startMarking}>
            <PencilLine aria-hidden="true" size={15} /> {timings ? "Վերանշել" : "Նշել համարները"}
          </button>
        </div>
      ) : null}
      {message ? <p className="m-0 text-center font-sans text-[12.5px] text-gold-bright" role="status">{message}</p> : null}

      <div className="psalm-lines grid gap-1">
        {lines.map((line, index) => (
          <p
            key={index}
            ref={(element) => { lineRefs.current[index] = element; }}
            className={`-mx-2 m-0 cursor-pointer rounded-[10px] px-2 py-0.5 transition-[color,background-color,opacity] duration-500 ${superscription && index === 0 ? "psalm-superscription mb-3 border-b border-[rgb(217_181_111/32%)] pb-3 text-center" : ""} ${following && verseOf[index] >= 0 ? verseOf[index] === active ? "bg-[rgb(217_181_111/16%)] opacity-100" : "opacity-45" : ""} ${marking && verseOf[index] >= 0 && verseOf[index] === nextIndex ? "outline-2 outline-dashed outline-[rgb(217_181_111/60%)]" : ""} ${verseOf[index] < 0 ? "cursor-default" : ""}`}
            onClick={() => onLineClick(index)}
          >
            {marking && verseOf[index] >= 0 && verseOf[index - 1] !== verseOf[index] ? <span className="mr-2 inline-block min-w-[38px] font-sans text-[11px] font-bold text-gold tabular-nums">{typeof draft[verseOf[index]] === "number" ? formatSeconds(draft[verseOf[index]] as number) : "—"}</span> : null}
            {line}
          </p>
        ))}
      </div>

      {marking ? (
        <div className="sticky bottom-[calc(var(--tg-inset-bottom,0px)+12px)] z-20 grid gap-2 rounded-[18px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-3 font-sans shadow-[0_18px_44px_rgb(40_20_10/28%)]">
          <p className="m-0 text-[12px] leading-snug text-muted">
            Լսեք ձայնագրությունը և սեղմեք <strong className="text-ink">«Հաջորդ համարը»</strong> հենց որ սկսվի նոր համարը (համակարգչում՝ Space)։ Սխալը ուղղելու համար սեղմեք տողի վրա՝ ճիշտ պահին։
          </p>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
            <button className={`${button} min-h-12 border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[14px] text-[#2a1708]`} type="button" disabled={nextIndex < 0} onClick={markNext}>
              <SkipForward aria-hidden="true" size={17} /> {nextIndex < 0 ? "Բոլորը նշված են" : `Հաջորդ՝ համար ${verseNumbers[nextIndex]} (${nextIndex + 1}/${verseCount})`}
            </button>
            <button className={`${button} border-glass-border bg-subtle text-ink`} type="button" onClick={undo} aria-label="Հետարկել վերջին նշումը" title="Հետարկել"><RotateCcw aria-hidden="true" size={16} /></button>
            <button className={`${button} border-[rgb(74_160_96/50%)] bg-[rgb(74_160_96/14%)] text-[rgb(52_130_74)]`} type="button" disabled={saving || draft.every((value) => value === null)} onClick={() => save(draft)} aria-label="Պահել" title="Պահել"><Check aria-hidden="true" size={17} /></button>
            <button className={`${button} border-glass-border bg-transparent text-muted`} type="button" onClick={() => setMarking(false)} aria-label="Չեղարկել" title="Չեղարկել"><X aria-hidden="true" size={17} /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
