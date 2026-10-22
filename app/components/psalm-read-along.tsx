import { Bookmark, Check, Copy, PencilLine, Play, RotateCcw, Share2, SkipForward, X } from "lucide-react";
import { Link } from "react-router";
import { createPortal } from "react-dom";
import { psalmLines, verseBody, verseLabel, verseNumber } from "../utils/psalm-verses";
import { copyText, systemShare } from "./share-button";
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
 *
 * The verse being sung keeps a thin gold bar at its side; a tapped verse is underlined with dots
 * (as on bible.com), so the two never look alike. Tapping a verse opens a small popup, as on bible.com: copy, share (the verse's own page,
 * /saghmosner/22/3), save in «Իմ անկյունը», and listen from this verse. A shared verse opens the
 * psalm at "#3", which lights that verse and opens its popup.
 */
export function PsalmReadAlong({ text, materialId, timings: savedTimings, canMark = false, psalmPath, title, hasAudio = false, canSave = false, savedVerses = [] }: {
  text: string; materialId: string; timings?: Timings | null; canMark?: boolean;
  psalmPath: string; title: string; hasAudio?: boolean; canSave?: boolean; savedVerses?: number[];
}) {
  // The psalm by the library's standard: superscription, numbered verses, headings (psalm-verses.ts).
  const parsed = useMemo(() => psalmLines(text).filter((line) => line.kind !== "label"), [text]);
  const lines = useMemo(() => parsed.map((line) => line.text), [parsed]);
  // Only numbered verses are marked and followed ("1 Երանելի է…"); the title, the psalm number and
  // the superscription are not. Numbering may start at 2; an unnumbered line after a verse belongs to it.
  const { verseOf, verseCount, verseNumbers } = useMemo(() => {
    const map: number[] = [];
    const numbers: number[] = [];
    let current = -1;
    for (const line of parsed) {
      const number = line.kind === "verse" ? verseNumber(line.text) : null;
      if (number) { current += 1; numbers.push(Number(number)); }
      // Superscription and headings belong to no verse; a continuation to the verse before it.
      map.push(line.kind === "verse" || line.kind === "continuation" ? current : -1);
    }
    return { verseOf: map, verseCount: current + 1, verseNumbers: numbers };
  }, [parsed]);
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

  // The verse whose popup is open (an index into the numbered verses).
  const [selected, setSelected] = useState<number | null>(null);
  // The popup slides down before it goes ("out"), then the verse is let go.
  const [popupPhase, setPopupPhase] = useState<"in" | "out">("in");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePopup = useCallback(() => {
    setPopupPhase("out");
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { setSelected(null); setPopupPhase("in"); }, 380);
  }, []);
  const openPopup = useCallback((index: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPopupPhase("in");
    setSelected(index);
  }, []);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const [saved, setSaved] = useState(() => new Set(savedVerses));
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((value: string) => {
    setNotice(value);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2_200);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => setNotice(null), [selected]);

  const verseText = (index: number) => lines.filter((_, line) => verseOf[line] === index).map((line, part) => part === 0 ? verseBody(line) : line).join(" ");

  const listenFrom = (index: number) => {
    const audio = currentAudio();
    if (!audio) return;
    const start = timings?.[index];
    const seek = () => { audio.currentTime = typeof start === "number" ? start : estimated[index] * audio.duration; void audio.play().catch(() => undefined); };
    // Before the recording has loaded its length, an estimated place waits for it.
    if (typeof start === "number" || Number.isFinite(audio.duration)) seek();
    else { audio.addEventListener("loadedmetadata", seek, { once: true }); void audio.play().catch(() => undefined); }
  };

  // A shared verse ("/saghmosner/22#3"): light it and open its popup.
  useEffect(() => {
    const number = Number(window.location.hash.slice(1));
    const index = Number.isInteger(number) && number > 0 ? verseNumbers.indexOf(number) : -1;
    if (index < 0) return;
    openPopup(index);
    lineRefs.current[verseOf.indexOf(index)]?.scrollIntoView({ block: "center" });
  }, [openPopup, verseNumbers, verseOf]);

  // A tap outside the verses and the popup, or Escape, closes the popup.
  useEffect(() => {
    if (selected === null) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-verse-popup], .psalm-lines [data-verse]")) return;
      closePopup();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closePopup(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [closePopup, selected]);

  const onLineClick = (lineIndex: number) => {
    const index = verseOf[lineIndex];
    if (index < 0) return;
    if (marking) {
      const audio = currentAudio();
      if (!audio || !Number.isFinite(audio.duration)) return;
      // While marking, a tap sets this verse's start to the current moment (to fix one mark).
      setDraft((current) => { const next = [...current]; next[index] = Math.round(audio.currentTime * 100) / 100; return next; });
      return;
    }
    // Selecting words to copy them is not a tap on the verse.
    if (window.getSelection()?.toString().trim()) return;
    if (selected === index && popupPhase === "in") closePopup();
    else openPopup(index);
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
            className={`-mx-2 m-0 cursor-pointer rounded-[10px] px-2 py-0.5 transition-[color,background-color,opacity,box-shadow] duration-500 ${parsed[index].kind === "superscription" ? `psalm-superscription text-center italic ${parsed[index + 1]?.kind !== "superscription" ? "mb-3 border-b border-[rgb(217_181_111/32%)] pb-3" : ""}` : parsed[index].kind === "heading" ? "mt-3 mb-1 text-center font-sans text-[0.78em] font-bold tracking-[0.12em] text-gold" : ""} ${following && verseOf[index] >= 0 ? verseOf[index] === active ? "rounded-none opacity-100 shadow-[inset_3px_0_0_rgb(217_181_111/90%)]" : verseOf[index] === selected ? "" : "opacity-45" : ""} ${selected !== null && verseOf[index] === selected ? "underline decoration-[rgb(217_181_111/85%)] decoration-dotted decoration-2 underline-offset-[6px] opacity-100" : ""} ${marking && verseOf[index] >= 0 && verseOf[index] === nextIndex ? "outline-2 outline-dashed outline-[rgb(217_181_111/60%)]" : ""} ${verseOf[index] < 0 ? "cursor-default" : ""}`}
            data-verse={verseOf[index] >= 0 ? verseNumbers[verseOf[index]] : undefined}
            onClick={() => onLineClick(index)}
          >
            {marking && verseOf[index] >= 0 && verseOf[index - 1] !== verseOf[index] ? <span className="mr-2 inline-block min-w-[38px] font-sans text-[11px] font-bold text-gold tabular-nums">{typeof draft[verseOf[index]] === "number" ? formatSeconds(draft[verseOf[index]] as number) : "—"}</span> : null}
            {line}
          </p>
        ))}
      </div>

      {selected !== null && !marking ? (
        <VersePopup
          label={verseLabel(psalmPath, title, verseNumbers[selected])}
          text={verseText(selected)}
          path={`${psalmPath}/${verseNumbers[selected]}`}
          hasAudio={hasAudio}
          canSave={canSave}
          saved={saved.has(verseNumbers[selected])}
          notice={notice}
          phase={popupPhase}
          onClose={closePopup}
          onNotice={flash}
          onListen={() => { listenFrom(selected); closePopup(); }}
          onSave={async () => {
            const number = verseNumbers[selected];
            const next = !saved.has(number);
            setSaved((current) => { const copy = new Set(current); if (next) copy.add(number); else copy.delete(number); return copy; });
            const response = await fetch("/api/saved-verses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, verse: number, saved: next }) }).catch(() => null);
            if (response?.ok) { flash(next ? "Պահված է «Իմ անկյունը»-ում" : "Հանված է «Իմ անկյունը»-ից"); return; }
            setSaved((current) => { const copy = new Set(current); if (next) copy.delete(number); else copy.add(number); return copy; });
            flash("Չհաջողվեց պահել։ Փորձեք նորից։");
          }}
        />
      ) : null}

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

const popupTile = "flex min-h-[62px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-0 bg-subtle px-1 font-sans text-[11.5px] font-bold text-ink no-underline active:scale-[.96]";

/** The verse popup: copy, share the verse's page, save it, listen from it. */
function VersePopup({ label, text, path, hasAudio, canSave, saved, notice, phase, onClose, onNotice, onListen, onSave }: {
  label: string; text: string; path: string; hasAudio: boolean; canSave: boolean; saved: boolean; notice: string | null; phase: "in" | "out";
  onClose: () => void; onNotice: (value: string) => void; onListen: () => void; onSave: () => void;
}) {
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setNeedsSignIn(false); setCopied(false); }, [path]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const url = () => `${window.location.origin}${path}`;
  const copy = async () => {
    if (copied) return;
    await copyText(`${label}\n«${text}»\n${url()}`);
    // The button turns into a check mark, then the popup goes.
    setCopied(true);
    copiedTimer.current = setTimeout(onClose, 900);
  };
  const share = async () => {
    if (await systemShare({ title: label, text: `${label}\n«${text}»`, url: url() })) return;
    await copyText(url());
    onNotice("Հղումը պատճենվեց");
  };
  if (typeof document === "undefined") return null;
  // On the page's body: the reading panel's blur would otherwise hold a fixed popup inside it.
  return createPortal(
    <div className="fixed inset-x-0 bottom-[calc(var(--tg-inset-bottom,0px)+12px)] z-[80] flex justify-center px-3" data-verse-popup role="dialog" aria-label={label}>
      <div className="install-toast grid w-full max-w-[440px] gap-2.5 rounded-[20px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-3 font-sans shadow-[0_18px_44px_rgb(40_20_10/28%)]" data-phase={phase}>
        <div className="flex items-center justify-between gap-2 pl-1">
          <strong className="text-[13px] text-gold-bright">{label}</strong>
          <button className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
        </div>
        <div className={`grid gap-1.5 ${hasAudio ? "grid-cols-4" : "grid-cols-3"}`}>
          <button className={`${popupTile} transition-colors duration-300 ${copied ? "bg-[rgb(74_160_96/16%)] text-[rgb(52_130_74)]" : ""}`} type="button" onClick={copy} aria-live="polite">
            {copied
              ? <Check aria-hidden="true" size={21} strokeWidth={2.4} className="verse-check" />
              : <Copy aria-hidden="true" size={19} strokeWidth={1.9} className="text-gold" />}
            {copied ? "Պատճենվեց" : "Պատճենել"}
          </button>
          <button className={popupTile} type="button" onClick={share}><Share2 aria-hidden="true" size={19} strokeWidth={1.9} className="text-gold" /> Կիսվել</button>
          <button className={popupTile} type="button" aria-pressed={saved} onClick={() => canSave ? onSave() : setNeedsSignIn(true)}>
            <Bookmark aria-hidden="true" size={19} strokeWidth={1.9} className="text-gold" fill={saved ? "currentColor" : "none"} /> {saved ? "Պահված է" : "Պահել"}
          </button>
          {hasAudio ? (
            <button className={`${popupTile} bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" onClick={onListen}><Play aria-hidden="true" size={19} strokeWidth={2} /> Լսել այստեղից</button>
          ) : null}
        </div>
        {needsSignIn ? (
          <p className="m-0 text-center text-[12px] text-muted">Պահելու համար մուտք գործեք՝ <Link className="font-bold text-gold-bright" to="/saved">Իմ անկյունը</Link></p>
        ) : notice ? <p className="m-0 text-center text-[12px] font-bold text-gold-bright" role="status">{notice}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
