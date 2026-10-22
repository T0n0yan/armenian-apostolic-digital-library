import type { BridgeRichContent } from "../../shared/telegram-bridge-contract";
import { richInlineText, stripZeroWidth } from "./text";

function comparableTitle(value: string) {
  return stripZeroWidth(value.normalize("NFC")).replace(/\s+/gu, " ").trim().toLocaleLowerCase("hy");
}


/** True when the first rich block only repeats the page title already shown in the header. */
export function richContentStartsWithTitle(value: BridgeRichContent, title: string) {
  const first = value.blocks[0];
  if (!first || (first.type !== "heading" && first.type !== "paragraph")) return false;
  const expected = comparableTitle(title);
  return expected.length > 0 && comparableTitle(richInlineText(first.content)) === expected;
}

/**
 * Length of the leading line of `text` when it repeats `title`, including the line breaks after it;
 * 0 when the text does not start with the title.
 */
export function leadingTitleLength(text: string, title: string) {
  const expected = comparableTitle(title);
  if (!expected) return 0;
  const lineEnd = text.indexOf("\n");
  const firstLine = lineEnd < 0 ? text : text.slice(0, lineEnd);
  if (comparableTitle(firstLine) !== expected) return 0;
  if (lineEnd < 0) return text.length;
  let end = lineEnd;
  while (end < text.length && /\s/u.test(text[end])) end += 1;
  return end;
}

const psalmLabel = /^[\s\u200B-\u200D\uFEFF]*\(?\s*սաղմոս\S*\s+\d{1,3}\s*\)?[\s.։]*$/iu;

/** A line such as "(Սաղմոս 3)" that only repeats the psalm number already shown by the player. */
export function isPsalmLabel(value: string) {
  return psalmLabel.test(value.normalize("NFC"));
}

/** Extends `from` past a following "(Սաղմոս N)" line and the blank lines after it. */
export function skipPsalmLabel(text: string, from: number) {
  let start = from;
  while (start < text.length && /\s/u.test(text[start])) start += 1;
  const lineEnd = text.indexOf("\n", start);
  const line = text.slice(start, lineEnd < 0 ? text.length : lineEnd);
  if (!isPsalmLabel(line)) return from;
  let end = lineEnd < 0 ? text.length : lineEnd;
  while (end < text.length && /\s/u.test(text[end])) end += 1;
  return end;
}

/**
 * A psalm's text without the title line and "(Սաղմոս N)" label: the first non-empty of the post's
 * text or caption, whatever formatting Telegram gave it.
 */
export function psalmBodyText(material: { title: string; contentText?: string | null; captionText?: string | null; formattedText: { text: string }; formattedCaption: { text: string } }) {
  const source = [material.formattedText.text, material.contentText, material.formattedCaption.text, material.captionText].find((value) => value?.trim()) ?? "";
  return source.slice(skipPsalmLabel(source, leadingTitleLength(source, material.title)));
}
