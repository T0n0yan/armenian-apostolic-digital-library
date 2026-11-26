import { HandHeart, AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Check, Eraser, Italic, Merge, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRevalidator } from "react-router";

import { LayoutParagraphView } from "./prayer-layout-view";
import { lockScroll } from "../utils/scroll-lock";
import {
  applyStyle, editText, mergeParagraphs, newParagraph, rangeStyle, splitOnBlankLines,
  type LayoutAlign, type LayoutFont, type LayoutKind, type LayoutParagraph, type LayoutSize, type PrayerLayout, type StyleCommand,
} from "../utils/prayer-layout";

type Selection = { paragraph: number; from: number; to: number };

/** Տեքստի դիրքը պարբերության մեջ (DOM-ի կետից)։ */
function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Ընտրությունը նորից ցույց տալ վերանկարելուց հետո։ */
function selectText(root: HTMLElement, from: number, to: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && from <= seen + length) { range.setStart(node, from - seen); started = true; }
    if (started && to <= seen + length) {
      range.setEnd(node, to - seen);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    seen += length;
  }
}

const kindLabels: Array<[LayoutKind, string]> = [["text", "Տեքստ"], ["note", "Նկարագրություն"], ["title", "Պիտակ"]];
const fontLabels: Array<[LayoutFont, string, string]> = [["book", "Գրքային", "font-book"], ["serif", "Սերիֆ", "font-noto"], ["sans", "Սովորական", "font-sans"]];
const sizeLabels: Array<[LayoutSize, string]> = [["sm", "Փոքր"], ["md", "Սովորական"], ["lg", "Մեծ"], ["xl", "Շատ մեծ"]];
const alignIcons: Array<[LayoutAlign, typeof AlignLeft, string]> = [["start", AlignLeft, "Ձախ"], ["center", AlignCenter, "Մեջտեղ"], ["end", AlignRight, "Աջ"], ["justify", AlignJustify, "Երկու կողմից"]];

function Chip({ active = false, onClick, label, children, disabled = false }: { active?: boolean; onClick: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-control border px-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-gold/70 bg-[rgb(217_181_111/22%)] text-gold-bright" : "border-edge bg-subtle text-ink hover:bg-[rgb(217_181_111/12%)]"}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      // Կոճակը սեղմելիս տեքստի ընտրությունը չի կորչում։
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PrayerLayoutEditor({ materialId, start, seed, saved, stale, hasAudio, onClose }: {
  materialId: string;
  /** Խմբագրի սկիզբը՝ պահված ձևավորումը կամ Telegram-ի տեքստը։ */
  start: PrayerLayout;
  /** Telegram-ի այժմյան տեքստը՝ նորից սկսելու համար։ */
  seed: PrayerLayout;
  saved: boolean;
  stale: boolean;
  hasAudio: boolean;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState(start);
  const [history, setHistory] = useState<PrayerLayout[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  // Կոճակները երևում են միայն այն պարբերության վրա, որին սեղմել են։
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<Selection | null>(null);
  const revalidator = useRevalidator();
  const dirty = history.length > 0;

  useEffect(() => lockScroll(), []);

  // Հետարկելու պատմությունը. տեքստը տառ առ տառ գրելիս մեկ քայլ է պահվում։
  const lastStep = useRef<string | null>(null);
  const update = (change: (current: PrayerLayout) => PrayerLayout, step: string | null = null) => {
    const next = change(layout);
    if (next === layout) return;
    if (step === null || step !== lastStep.current) setHistory((past) => [...past.slice(-49), layout]);
    lastStep.current = step;
    setLayout(next);
  };

  const setParagraph = (index: number, change: (paragraph: LayoutParagraph) => LayoutParagraph | LayoutParagraph[], step: string | null = null) => update((current) => {
    const result = change(current.paragraphs[index]);
    const list = Array.isArray(result) ? result : [result];
    if (list.length === 1 && list[0] === current.paragraphs[index]) return current;
    return { ...current, paragraphs: [...current.paragraphs.slice(0, index), ...list, ...current.paragraphs.slice(index + 1)] };
  }, step);

  // Տեքստի ընտրությունը պարբերության մեջ (մկնիկով կամ մատով)։ Կոճակներին սեղմելիս այն մնում է։
  useEffect(() => {
    const onChange = () => {
      const current = document.getSelection();
      if (!current || current.rangeCount === 0) return;
      const range = current.getRangeAt(0);
      const startElement = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>("[data-layout-paragraph]");
      if (!startElement || !rootRef.current?.contains(startElement)) return;
      if (range.collapsed) { setSelection(null); return; }
      const paragraph = Number(startElement.dataset.layoutParagraph);
      const from = textOffset(startElement, range.startContainer, range.startOffset);
      const to = startElement.contains(range.endContainer) ? textOffset(startElement, range.endContainer, range.endOffset) : (startElement.textContent?.length ?? from);
      setSelection(to > from ? { paragraph, from, to } : null);
      setActive(paragraph);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  // Ձևը փոխելուց հետո տեքստը նորից է նկարվում. ընտրությունը վերականգնվում է։
  useLayoutEffect(() => {
    const target = restoreRef.current;
    restoreRef.current = null;
    if (!target) return;
    const element = rootRef.current?.querySelector<HTMLElement>(`[data-layout-paragraph="${target.paragraph}"]`);
    if (element) selectText(element, target.from, target.to);
  }, [layout]);

  const styleSelection = (command: StyleCommand) => {
    if (!selection) return;
    restoreRef.current = selection;
    setParagraph(selection.paragraph, (paragraph) => applyStyle(paragraph, selection.from, selection.to, command));
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((past) => past.slice(0, -1));
    lastStep.current = null;
    setLayout(previous);
    setSelection(null);
  };

  const move = (index: number, delta: number) => update((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.paragraphs.length) return current;
    const paragraphs = [...current.paragraphs];
    [paragraphs[index], paragraphs[target]] = [paragraphs[target], paragraphs[index]];
    return { ...current, paragraphs };
  });

  const close = () => {
    if (dirty && !window.confirm("Փոփոխությունները պահված չեն։ Փակե՞լ առանց պահելու։")) return;
    onClose();
  };

  const send = async (value: PrayerLayout | null) => {
    setStatus("saving");
    const response = await fetch("/api/material-layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId, layout: value ? { ...value, paragraphs: value.paragraphs.filter((paragraph) => paragraph.text.trim()) } : null }),
    }).catch(() => null);
    if (!response?.ok) { setStatus("error"); return; }
    setStatus("idle");
    await revalidator.revalidate();
    onClose();
  };

  const resetToTelegram = () => {
    if (!window.confirm("Ջնջե՞լ ձևավորումը։ Էջը նորից ցույց կտա Telegram-ի տեքստը։")) return;
    void send(null);
  };

  const restartFromSeed = () => {
    if (!window.confirm("Սկսե՞լ Telegram-ի այժմյան տեքստից։ Այս ձևավորումը կփոխարինվի (մինչև «Պահել»-ը կարող եք հետարկել)։")) return;
    update(() => seed);
    setSelection(null);
    setEditing(null);
  };

  const selected = selection ? layout.paragraphs[selection.paragraph] : null;
  const current = selected && selection ? rangeStyle(selected, selection.from, selection.to) : null;
  const nonEmpty = layout.paragraphs.some((paragraph) => paragraph.text.trim());

  const editor = (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--page-bg)] text-ink" role="dialog" aria-modal="true" aria-label="Աղոթքի ձևավորում" ref={rootRef}>
      <header className="flex flex-wrap items-center gap-2 border-b border-edge bg-nav-surface px-3 py-2 min-[560px]:px-5">
        <Chip onClick={close} label="Փակել"><X size={18} aria-hidden="true" /></Chip>
        <h2 className="m-0 mr-auto text-[15px] font-bold">Ձևավորում</h2>
        <Chip onClick={undo} label="Հետարկել" disabled={!dirty}><Undo2 size={17} aria-hidden="true" /></Chip>
        <button
          type="button"
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control bg-gold px-3.5 text-[13px] font-bold text-[#1d1022] disabled:opacity-50"
          disabled={status === "saving" || !nonEmpty}
          onClick={() => void send(layout)}
        >
          <Check size={16} aria-hidden="true" /> {status === "saving" ? "Պահվում է…" : "Պահել"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-40 min-[560px]:px-5">
        <div className="mx-auto grid max-w-[760px] gap-3">
          {status === "error" ? <p className="m-0 rounded-control border border-[rgb(205_70_55/50%)] bg-[rgb(205_70_55/10%)] p-3 text-[13px]">Չհաջողվեց պահել։ Ստուգեք կապը և նորից փորձեք։</p> : null}
          {stale ? (
            <div className="grid gap-2 rounded-control border border-gold/50 bg-[rgb(217_181_111/12%)] p-3 text-[13px] leading-snug">
              <span className="flex items-start gap-2"><TriangleAlert className="mt-0.5 shrink-0 text-gold" size={17} aria-hidden="true" /> Telegram-ում այս աղոթքի տեքստը փոխվել է ձևավորելուց հետո։ Էջը դեռ ցույց է տալիս ձեր ձևավորածը։</span>
              <span><Chip onClick={restartFromSeed} label="Սկսել Telegram-ի նոր տեքստից"><RotateCcw size={15} aria-hidden="true" /> Սկսել Telegram-ի նոր տեքստից</Chip></span>
            </div>
          ) : null}
          <p className="m-0 text-[12.5px] leading-relaxed text-muted">
            Ամեն պարբերության համար ընտրեք տեսակը, դիրքը, չափը, տառատեսակը և թռչնատառը։ «Աղոթք» նշանը ցույց է տալիս, որ պարբերությունը բուն աղոթքն է (ընթերցողը այն չի տեսնում. պետք է աղոթքը առանձին կիսվելու համար)։ Բառերը կամ տառերը ձևավորելու համար ընտրեք դրանք տեքստում (մկնիկով կամ մատը պահելով). ներքևում կհայտնվեն կոճակները։
            {hasAudio ? " Ձևավորված աղոթքում տեքստը ձայնի հետ տող առ տող չի ընդգծվի։" : ""}
          </p>

          {layout.paragraphs.map((paragraph, index) => (
            <section className={`grid gap-2 rounded-button border p-2.5 ${active === index ? "border-gold/60 bg-surface" : "border-edge"}`} key={index} aria-label={`Պարբերություն ${index + 1}`} onClick={() => setActive(index)}>
              {active === index ? <>
              <div className="flex flex-wrap items-center gap-1.5">
                {kindLabels.map(([kind, label]) => (
                  <Chip key={kind} active={paragraph.kind === kind} label={label} onClick={() => setParagraph(index, (item) => item.kind === kind ? item : ({
                    ...item, kind,
                    align: kind === "title" && item.align === "start" ? "center" : item.align,
                    // Նկարագրությունը սկսում է շեղով, բայց կարելի է անջատել (և տառատեսակը փոխել)։
                    italic: kind === "note" ? true : item.kind === "note" ? false : item.italic,
                    // Նկարագրությունն ու պիտակը աղոթքի մաս չեն։
                    prayer: kind === "text",
                  }))}>{label}</Chip>
                ))}
                <span className="mx-0.5 h-6 w-px bg-edge" aria-hidden="true" />
                {alignIcons.map(([align, Icon, label]) => (
                  <Chip key={align} active={paragraph.align === align} label={label} onClick={() => setParagraph(index, (item) => ({ ...item, align }))}><Icon size={16} aria-hidden="true" /></Chip>
                ))}
                <span className="mx-0.5 h-6 w-px bg-edge" aria-hidden="true" />
                <Chip active={paragraph.initial && paragraph.kind === "text"} disabled={paragraph.kind !== "text"} label="Թռչնատառ" onClick={() => setParagraph(index, (item) => ({ ...item, initial: !item.initial }))}>
                  <span className="font-trchnatar text-[18px] leading-none" aria-hidden="true">Ա</span> Թռչնատառ
                </Chip>
                <Chip active={paragraph.prayer} label="Բուն աղոթքի մաս (ընթերցողին չի երևում)" onClick={() => setParagraph(index, (item) => ({ ...item, prayer: !item.prayer }))}>
                  <HandHeart size={15} aria-hidden="true" /> Աղոթք
                </Chip>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  className="min-h-9 rounded-control border border-edge bg-subtle px-2 text-[12px] font-semibold text-ink"
                  aria-label="Պարբերության չափը"
                  value={paragraph.size}
                  onChange={(event) => setParagraph(index, (item) => ({ ...item, size: event.target.value as LayoutSize }))}
                >
                  {sizeLabels.map(([size, label]) => <option key={size} value={size}>{label}</option>)}
                </select>
                <select
                  className="min-h-9 rounded-control border border-edge bg-subtle px-2 text-[12px] font-semibold text-ink"
                  aria-label="Պարբերության տառատեսակը"
                  value={paragraph.font}
                  onChange={(event) => setParagraph(index, (item) => ({ ...item, font: event.target.value as LayoutFont }))}
                >
                  {fontLabels.map(([font, label]) => <option key={font} value={font}>{label}</option>)}
                </select>
                <Chip active={paragraph.bold} label="Ամբողջը թավ" onClick={() => setParagraph(index, (item) => ({ ...item, bold: !item.bold }))}><Bold size={15} aria-hidden="true" /></Chip>
                <Chip active={paragraph.italic} label="Ամբողջը շեղ" onClick={() => setParagraph(index, (item) => ({ ...item, italic: !item.italic }))}><Italic size={15} aria-hidden="true" /></Chip>
                <span className="mx-0.5 h-6 w-px bg-edge" aria-hidden="true" />
                <Chip active={editing === index} label="Ուղղել տեքստը" onClick={() => { setSelection(null); setEditing(editing === index ? null : index); }}><Pencil size={15} aria-hidden="true" /> Տեքստ</Chip>
                <Chip label="Վեր" disabled={index === 0} onClick={() => { move(index, -1); setActive(index - 1); }}><ArrowUp size={15} aria-hidden="true" /></Chip>
                <Chip label="Վար" disabled={index === layout.paragraphs.length - 1} onClick={() => { move(index, 1); setActive(index + 1); }}><ArrowDown size={15} aria-hidden="true" /></Chip>
                <Chip label="Միացնել հաջորդին" disabled={index === layout.paragraphs.length - 1} onClick={() => update((value) => ({ ...value, paragraphs: [...value.paragraphs.slice(0, index), mergeParagraphs(value.paragraphs[index], value.paragraphs[index + 1]), ...value.paragraphs.slice(index + 2)] }))}><Merge size={15} aria-hidden="true" /></Chip>
                <Chip label="Նոր պարբերություն ներքևում" onClick={() => { update((value) => ({ ...value, paragraphs: [...value.paragraphs.slice(0, index + 1), newParagraph(), ...value.paragraphs.slice(index + 1)] })); setEditing(index + 1); setActive(index + 1); }}><Plus size={15} aria-hidden="true" /></Chip>
                <Chip label="Ջնջել պարբերությունը" disabled={layout.paragraphs.length <= 1} onClick={() => { if (window.confirm("Ջնջե՞լ այս պարբերությունը։")) { setSelection(null); setEditing(null); setActive(Math.max(0, index - 1)); update((value) => ({ ...value, paragraphs: value.paragraphs.filter((_, item) => item !== index) })); } }}><Trash2 size={15} aria-hidden="true" /></Chip>
              </div>
              </> : null}

              {editing === index && active === index ? (
                <div className="grid gap-1.5">
                  <textarea
                    className="min-h-32 w-full resize-y rounded-control border border-edge bg-subtle p-2.5 font-[inherit] text-[15px] leading-relaxed text-ink"
                    value={paragraph.text}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    aria-label="Պարբերության տեքստը"
                    onChange={(event) => { const value = event.target.value; setParagraph(index, (item) => editText(item, value), `text-${index}`); }}
                  />
                  <span className="text-[11.5px] text-muted">Դատարկ տողը (երկու Enter) պարբերությունը կբաժանի երկուսի։ Ձևավորված բառերը պահում են իրենց ձևը։</span>
                  <span><Chip label="Պատրաստ" onClick={() => { setEditing(null); setParagraph(index, splitOnBlankLines); }}><Check size={15} aria-hidden="true" /> Պատրաստ</Chip></span>
                </div>
              ) : null}

              {/* Միայն խմբագրում. ընթերցողը այս նշանը չի տեսնում։ */}
              {paragraph.prayer && paragraph.text.trim() ? <span className="inline-flex items-center gap-1 justify-self-start rounded-full bg-[rgb(217_181_111/18%)] px-2 py-0.5 text-[10.5px] font-bold text-gold-bright"><HandHeart size={12} aria-hidden="true" /> Աղոթք</span> : null}
              {/* Նախադիտում՝ ինչպես էջում. այստեղ ընտրվում են բառերը։ */}
              <div className="prayer-text">
                <div className="reading-body-preview prayer-layout rounded-control bg-subtle px-3 py-2.5 text-[length:var(--reading-size)] leading-[1.85] select-text">
                  <LayoutParagraphView paragraph={paragraph} index={index} editing />
                </div>
              </div>
            </section>
          ))}

          <div className="mt-2 flex flex-wrap gap-2 border-t border-edge pt-3">
            {!stale ? <Chip onClick={restartFromSeed} label="Սկսել Telegram-ի տեքստից"><RotateCcw size={15} aria-hidden="true" /> Սկսել Telegram-ի տեքստից</Chip> : null}
            {saved ? <Chip onClick={resetToTelegram} label="Ջնջել ձևավորումը"><Trash2 size={15} aria-hidden="true" /> Ջնջել ձևավորումը (Telegram-ի տեսքը)</Chip> : null}
          </div>
        </div>
      </div>

      {/* Ընտրված բառերի/տառերի կոճակները։ */}
      {selection && selected && current ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-edge bg-nav-surface px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/18%)]">
          <div className="mx-auto grid max-w-[760px] gap-1.5">
            <span className="truncate text-[11.5px] text-muted">Ընտրված՝ «{selected.text.slice(selection.from, selection.to)}»</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={current.bold} label="Թավ" onClick={() => styleSelection({ type: "bold" })}><Bold size={15} aria-hidden="true" /></Chip>
              <Chip active={current.italic} label="Շեղ" onClick={() => styleSelection({ type: "italic" })}><Italic size={15} aria-hidden="true" /></Chip>
              <Chip active={current.color === "gold"} label="Ոսկեգույն" onClick={() => styleSelection({ type: "color", color: "gold" })}><span className="size-3.5 rounded-full bg-gold-bright" aria-hidden="true" /> Ոսկի</Chip>
              <Chip active={current.color === "red"} label="Կարմիր" onClick={() => styleSelection({ type: "color", color: "red" })}><span className="size-3.5 rounded-full bg-[rgb(168_38_30)]" aria-hidden="true" /> Կարմիր</Chip>
              <Chip active={current.size === "sm"} label="Փոքր տառեր" onClick={() => styleSelection({ type: "size", size: "sm" })}><span className="text-[11px]">Ա</span></Chip>
              <Chip active={current.size === "lg"} label="Մեծ տառեր" onClick={() => styleSelection({ type: "size", size: "lg" })}><span className="text-[15px]">Ա</span></Chip>
              <Chip active={current.size === "xl"} label="Շատ մեծ տառեր" onClick={() => styleSelection({ type: "size", size: "xl" })}><span className="text-[19px] leading-none">Ա</span></Chip>
              <span className="mx-0.5 h-6 w-px bg-edge" aria-hidden="true" />
              {fontLabels.map(([font, label, className]) => (
                <Chip key={font} active={current.font === font} label={`Տառատեսակ՝ ${label}`} onClick={() => styleSelection({ type: "font", font })}><span className={className}>{label}</span></Chip>
              ))}
              <Chip label="Մաքրել ձևը" onClick={() => styleSelection({ type: "clear" })}><Eraser size={15} aria-hidden="true" /></Chip>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(editor, document.body);
}
