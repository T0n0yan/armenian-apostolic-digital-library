import type { CSSProperties } from "react";

import { CHAR_SCALE, PARAGRAPH_SCALE, paragraphSegments, type CharStyle, type LayoutParagraph, type PrayerLayout } from "../utils/prayer-layout";
import { preloadTrchnatar } from "../utils/trchnatar";

const alignClass = { start: "text-left", center: "text-center", end: "text-right", justify: "text-justify" } as const;
const colorClass = { gold: "layout-gold", red: "layout-red" } as const;

function charClass(style: CharStyle) {
  return [style.b ? "font-bold" : "", style.i ? "italic" : "", style.c ? colorClass[style.c] : "", style.f ? `layout-font-${style.f}` : ""].filter(Boolean).join(" ") || undefined;
}

/** Մեկ պարբերություն. `index`-ը խմբագրում ընտրության տեղը գտնելու համար է։ */
export function LayoutParagraphView({ paragraph, index, editing = false }: { paragraph: LayoutParagraph; index: number; editing?: boolean }) {
  const kindClass = paragraph.kind === "note" ? "layout-note" : paragraph.kind === "title" ? "layout-title" : "";
  // Չափը inline է, որովհետև `.prayer-text p`-ի կանոնը ավելի ուժեղ է Tailwind-ի դասից։
  const style: CSSProperties = { fontSize: `${(paragraph.kind === "note" ? 0.9 : 1.08) * PARAGRAPH_SCALE[paragraph.size]}em` };
  const segments = paragraphSegments(paragraph);
  return (
    <p
      className={`layout-paragraph m-0 whitespace-pre-wrap break-words ${alignClass[paragraph.align]} ${kindClass} layout-font-${paragraph.font} ${paragraph.bold ? "font-bold" : ""} ${paragraph.italic ? "italic" : ""}`}
      data-align={paragraph.align}
      data-layout-paragraph={editing ? index : undefined}
      style={style}
    >
      {segments.length === 0 && editing ? <span className="text-faint">…</span> : null}
      {segments.map((segment) => {
        const size = segment.style.s ? { fontSize: `${CHAR_SCALE[segment.style.s]}em` } : undefined;
        if (segment.initial) preloadTrchnatar(segment.text);
        if (segment.initial) return <span className="ornate-initial" key={segment.from}>{segment.text}</span>;
        return <span className={charClass(segment.style)} style={size} key={segment.from}>{segment.text}</span>;
      })}
    </p>
  );
}

/** Ադմինի ձևավորած աղոթքը կարդալու էջում (Telegram-ի տեքստի փոխարեն)։ */
export function PrayerLayoutView({ layout }: { layout: PrayerLayout }) {
  return (
    <section className="reading-body prayer-layout grid gap-3 paper-panel px-4 py-5 text-[length:var(--reading-size)] leading-[1.85] text-ink shadow-card min-[560px]:gap-4 min-[560px]:px-7 min-[560px]:py-7" aria-label="Աղոթքի տեքստ">
      {layout.paragraphs.map((paragraph, index) => <LayoutParagraphView paragraph={paragraph} index={index} key={index} />)}
    </section>
  );
}
