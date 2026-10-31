import { Fragment, useRef, useState, type ReactNode } from "react";

import { parseRichText } from "../utils/rich-text";


/** **Bold** inside a line. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/gu).map((part, index) =>
    /^\*\*[^*]+\*\*$/u.test(part) ? <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="grid gap-3">
      {parseRichText(text).map((block, index) => {
        if (block.type === "heading") return <h3 key={index} className="m-0 mt-1 font-noto text-[17px] leading-snug font-bold text-gold-bright">{inline(block.text)}</h3>;
        if (block.type === "paragraph") return <p key={index} className="m-0 whitespace-pre-line">{inline(block.text)}</p>;
        const List = block.type === "bullets" ? "ul" : "ol";
        return (
          <List key={index} className={`m-0 grid gap-1.5 pl-5 ${block.type === "bullets" ? "list-disc marker:text-gold" : "list-decimal marker:font-semibold marker:text-gold"}`}>
            {block.items.map((item, at) => <li key={at} className="pl-1">{inline(item)}</li>)}
          </List>
        );
      })}
    </div>
  );
}

/**
 * The editor's field for that text: buttons put the marks in at the cursor (a heading, bold, a
 * bulleted or numbered list), and «Նախադիտում» shows it as readers will see it.
 */
export function RichTextField({ name, defaultValue, className }: { name: string; defaultValue: string; className: string }) {
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // Wraps the selection (bold) or starts each selected line with a mark (heading, lists).
  const apply = (kind: "heading" | "bold" | "bullets" | "numbers") => {
    const area = field.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    let next: string;
    let caret: number;
    if (kind === "bold") {
      const chosen = value.slice(start, end) || "թավ տեքստ";
      next = `${value.slice(0, start)}**${chosen}**${value.slice(end)}`;
      caret = start + chosen.length + 4;
    } else {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
      const lines = value.slice(lineStart, lineEnd).split("\n").map((line, index) => {
        const bare = line.replace(/^(#{1,3}|[-•*]|\d{1,3}[.)])\s+/u, "");
        return kind === "heading" ? `## ${bare}` : kind === "bullets" ? `- ${bare}` : `${index + 1}. ${bare}`;
      });
      next = `${value.slice(0, lineStart)}${lines.join("\n")}${value.slice(lineEnd)}`;
      caret = lineStart + lines.join("\n").length;
    }
    setValue(next);
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(caret, caret); });
  };
  const tool = "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-[9px] border border-glass-border bg-subtle px-2.5 text-[12.5px] font-semibold text-ink";
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Ձևավորում">
        <button type="button" className={tool} onClick={() => apply("heading")} disabled={preview}>Վերնագիր</button>
        <button type="button" className={`${tool} font-bold`} onClick={() => apply("bold")} disabled={preview}>Թավ</button>
        <button type="button" className={tool} onClick={() => apply("bullets")} disabled={preview}>• Ցուցակ</button>
        <button type="button" className={tool} onClick={() => apply("numbers")} disabled={preview}>1. Համարակալված</button>
        <button type="button" className={`${tool} ml-auto ${preview ? "border-[rgb(217_181_111/60%)] text-gold-bright" : ""}`} aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Խմբագրել" : "Նախադիտում"}</button>
      </div>
      {/* The field stays in the form (hidden while previewing) so «Պահել» always sends the text. */}
      <textarea ref={field} className={`${className} ${preview ? "hidden" : ""}`} name={name} value={value} onChange={(event) => setValue(event.target.value)} rows={8} />
      {preview ? <div className="rounded-[14px] border border-glass-border bg-subtle p-3.5 text-[15px] leading-relaxed text-ink">{value.trim() ? <RichText text={value} /> : <span className="text-faint">Դատարկ է</span>}</div> : null}
    </div>
  );
}
