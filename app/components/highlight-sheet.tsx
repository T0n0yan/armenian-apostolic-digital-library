import { Check, Copy, ExternalLink, HelpCircle, Highlighter, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { BottomSheet } from "./bottom-sheet";
import { ReminderButton } from "./reminder-button";
import { formatYerevanDateTime } from "../utils/armenian-date";
import { NOTE_MAX, QUICK_EMOJIS, cleanEmoji, firstEmoji, highlightCopyText, type Highlight } from "../utils/highlights";

type Change = Partial<Pick<Highlight, "kind" | "emoji" | "note" | "answer">> & { answered?: boolean };

/** Մեկ հարցում «/api/highlights»-ին. պատասխանը՝ թարմացված նշումը կամ null։ */
export async function highlightRequest(body: Record<string, unknown>): Promise<{ ok: boolean; highlight?: Highlight; reason?: string } | null> {
  const response = await fetch("/api/highlights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!response) return null;
  return (await response.json().catch(() => null)) as { ok: boolean; highlight?: Highlight; reason?: string } | null;
}

/** «4 նոյեմբերի 2026» Երևանի ժամով (որոշ բրաուզերներ հայերեն ամիսներ չունեն)։ */
export function formatNoteDate(iso: string) {
  return formatYerevanDateTime(iso).replace(/,\s*\d{2}:\d{2}$/, "");
}

const MY_EMOJIS_KEY = "my-emojis";
function readMyEmojis(): string[] {
  try { const value = JSON.parse(localStorage.getItem(MY_EMOJIS_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string" && cleanEmoji(item)).slice(0, 8) : []; } catch { return []; }
}
function rememberEmoji(emoji: string) {
  const next = [emoji, ...readMyEmojis().filter((item) => item !== emoji && !QUICK_EMOJIS.includes(item))].filter((item) => !QUICK_EMOJIS.includes(item)).slice(0, 8);
  try { localStorage.setItem(MY_EMOJIS_KEY, JSON.stringify(next)); } catch { /* պահեստը փակ է */ }
  return next;
}

const chip = "inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-edge bg-subtle px-3 text-[13px] font-semibold text-ink";
const field = "min-h-[96px] w-full resize-y rounded-button border border-edge bg-control px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none focus:border-[rgb(217_181_111/60%)]";

/**
 * Նշման քարտը. տողը, սմայլիկը, նոթը (կամ հարցը և պատասխանը), հիշեցումը, պատճենել, ջնջել։
 * Նշումը պահվում է «Պահել» կոճակով (փակելիս էլ, որ չկորչի)։
 */
export function HighlightSheet({ item, onClose, onChange, onDelete, showOpen = false }: {
  item: Highlight | null; onClose: () => void; onChange: (item: Highlight) => void; onDelete: (id: string) => void; showOpen?: boolean;
}) {
  const [current, setCurrent] = useState(item);
  const [note, setNote] = useState(item?.note ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [customEmoji, setCustomEmoji] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error" | "copied">("");
  const [myEmojis, setMyEmojis] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setMyEmojis(readMyEmojis()), []);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Change>({});

  useEffect(() => {
    if (!item) return;
    setCurrent(item); setNote(item.note); setAnswer(item.answer); setCustomEmoji(""); setStatus(""); setDirty(false);
    pending.current = {};
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (change: Change) => {
    if (!current) return;
    setStatus("saving");
    const result = await highlightRequest({ action: "update", id: current.id, ...change });
    if (result?.ok && result.highlight) { setCurrent(result.highlight); onChange(result.highlight); setStatus("saved"); }
    else setStatus("error");
  }, [current, onChange]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const change = pending.current;
    pending.current = {};
    if (Object.keys(change).length) void send(change);
  }, [send]);

  // Նշումը (և պատասխանը) պահվում է «Պահել» սեղմելիս (փակելիս էլ՝ որ չկորչի)։
  const later = (change: Change) => {
    pending.current = { ...pending.current, ...change };
    setDirty(true);
    setStatus("");
  };
  const saveText = () => { setDirty(false); flush(); };

  const close = () => { setDirty(false); flush(); onClose(); };

  if (!current) return <BottomSheet open={false} onClose={onClose} label="Նշում">{null}</BottomSheet>;
  const question = current.kind === "question";
  const answered = Boolean(current.answeredAt);

  const copy = async () => {
    const text = highlightCopyText(current, window.location.origin);
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
    setStatus(ok ? "copied" : "error");
  };
  const pickEmoji = (emoji: string) => void send({ emoji: current.emoji === emoji ? "" : emoji });
  // Մարդու իր սմայլիկը. դրվում է նշմանը և մնում արագ ցանկում (այս սարքում)։
  const addEmoji = () => {
    const emoji = cleanEmoji(customEmoji);
    if (!emoji) return;
    void send({ emoji });
    setCustomEmoji("");
    setMyEmojis(rememberEmoji(emoji));
  };
  // Մեկ սեղմումով. նշումն անմիջապես հեռացվում է։
  const remove = async () => {
    window.clearTimeout(timer.current);
    pending.current = {};
    const result = await highlightRequest({ action: "delete", id: current.id });
    if (result?.ok) { onDelete(current.id); onClose(); } else setStatus("error");
  };

  return (
    <BottomSheet open={Boolean(item)} onClose={close} label={question ? "Հարց" : "Նշում"} className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full border text-[18px] ${question ? "border-[rgb(120_165_230/45%)] bg-[rgb(120_165_230/14%)] text-[rgb(70_120_200)]" : "border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/12%)] text-gold-bright"}`}>
          {firstEmoji(current.emoji) || (question ? "❓" : <Highlighter aria-hidden="true" size={18} />)}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong className="text-[15px] text-ink">{question ? (answered ? "Հարց · պատասխանված" : "Հարց") : "Պահված խոսք"}</strong>
          <span className="line-clamp-1 text-[12.5px] text-muted">{current.title}{current.section ? ` · ${current.section}` : ""}</span>
        </div>
        <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={close} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
      </div>

      <blockquote className={`prayer-text m-0 max-h-40 overflow-y-auto rounded-button border-l-4 px-3 py-2 text-[15px] leading-[1.7] whitespace-pre-line text-ink ${question ? "border-[rgb(120_165_230/70%)] bg-[rgb(120_165_230/10%)]" : "border-[rgb(226_190_90/85%)] bg-[rgb(250_214_92/14%)]"}`}>
        {current.quote}
      </blockquote>

      {/* Սմայլիկը մարդն է ընտրում (ցանկալի չէ՝ կարող է և չդնել)։ */}
      <div className="grid gap-1.5">
        <span className="text-[12px] font-bold text-muted">Սմայլիկ (ըստ ցանկության)</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {[...myEmojis, ...QUICK_EMOJIS.filter((emoji) => !myEmojis.includes(emoji))].map((emoji) => (
            <button key={emoji} type="button" onClick={() => pickEmoji(emoji)} aria-pressed={current.emoji === emoji}
              className={`grid size-10 cursor-pointer place-items-center rounded-full border text-[19px] ${current.emoji === emoji ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)]" : "border-edge bg-subtle"}`}>{emoji}</button>
          ))}
          <input className="h-10 w-[74px] rounded-full border border-[var(--field-border)] bg-control px-3 text-center text-[17px] text-ink outline-none" value={customEmoji} inputMode="text" maxLength={16}
            placeholder="այլ" aria-label="Ձեր սմայլիկը" onChange={(event) => setCustomEmoji(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEmoji(); } }} />
          {customEmoji ? (
            <span className="flex items-center gap-1 animate-rise-in">
              <button className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(74_160_96/16%)] text-[rgb(52_130_74)] disabled:opacity-40" type="button" disabled={!cleanEmoji(customEmoji)} onClick={addEmoji} aria-label="Ավելացնել սմայլիկը"><Check aria-hidden="true" size={18} /></button>
              <button className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted" type="button" onClick={() => setCustomEmoji("")} aria-label="Չեղարկել"><X aria-hidden="true" size={17} /></button>
            </span>
          ) : null}
        </div>
        {customEmoji && !cleanEmoji(customEmoji) ? <span className="text-[11.5px] text-faint">Գրեք մեկ սմայլիկ։</span> : null}
      </div>

      <label className="grid gap-1.5">
        <span className="text-[12px] font-bold text-muted">{question ? "❓ Ձեր հարցը" : "✎ Ինչ տվեց Ձեզ այս խոսքը"}</span>
        <textarea className={field} value={note} maxLength={NOTE_MAX}
          placeholder={question ? "Օրինակ՝ ինչո՞ւ է այստեղ այսպես ասվում…" : "Ձեր միտքը, աղոթքը կամ ինչը դուր եկավ…"}
          onChange={(event) => { setNote(event.target.value); later({ note: event.target.value }); }} />
      </label>
      {dirty ? (
        <button className={`${chip} w-full animate-rise-in border-[rgb(217_181_111/55%)] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`} type="button" onClick={saveText}>
          <Check aria-hidden="true" size={16} /> Պահել
        </button>
      ) : null}

      {question ? (
        <div className="grid gap-2 rounded-button border border-edge bg-subtle p-3">
          {!answered ? (
            <ReminderButton materialId={current.materialId} title={current.title} path={current.path} label
              heading="Հիշեցնել հարցնել հոգևորականին" buttonText="Հիշեցնել հարցնել հոգևորականին" className={`${chip} w-full`} />
          ) : null}
          {answered ? (
            <label className="grid gap-1.5">
              <span className="text-[12px] font-bold text-[rgb(52_130_74)]">✓ Պատասխանը</span>
              <textarea className={field} value={answer} maxLength={NOTE_MAX} placeholder="Ինչ ասաց հոգևորականը…"
                onChange={(event) => { setAnswer(event.target.value); later({ answer: event.target.value }); }} />
            </label>
          ) : null}
          <button className={`${chip} w-full ${answered ? "" : "border-[rgb(74_160_96/50%)] bg-[rgb(74_160_96/12%)] text-[rgb(52_130_74)]"}`} type="button" onClick={() => void send({ answered: !answered })}>
            <Check aria-hidden="true" size={16} /> {answered ? "Նորից դարձնել չպատասխանված" : "Պատասխանը ստացա"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button className={chip} type="button" onClick={() => void send({ kind: question ? "mark" : "question" })}>
          {question ? <><Highlighter aria-hidden="true" size={16} /> Տեղափոխել «Խոսքեր»</> : <><HelpCircle aria-hidden="true" size={16} /> Տեղափոխել «Հարցեր»</>}
        </button>
        <button className={chip} type="button" onClick={() => void copy()}><Copy aria-hidden="true" size={16} /> Պատճենել</button>
        {showOpen ? (
          <Link className={`${chip} no-underline`} to={`${current.path}?hl=${encodeURIComponent(current.id)}`} onClick={close}><ExternalLink aria-hidden="true" size={16} /> Բացել տեքստում</Link>
        ) : null}
        <button className={`${chip} text-[rgb(190_60_45)] ${showOpen ? "" : "col-span-2"}`} type="button" onClick={() => void remove()}>
          <Trash2 aria-hidden="true" size={16} /> Ջնջել
        </button>
      </div>

      <p className="m-0 min-h-4 text-center text-[11.5px] text-faint" role="status" aria-live="polite">
        {status === "saving" ? "Պահվում է…" : status === "saved" ? "Պահված է ✓" : status === "copied" ? "Պատճենված է ✓" : status === "error" ? "Չհաջողվեց. ստուգեք կապը և փորձեք նորից։" : formatNoteDate(current.createdAt)}
      </p>
    </BottomSheet>
  );
}
