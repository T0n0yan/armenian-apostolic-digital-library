import type { BridgeRichContent, BridgeRichInline } from "../../shared/telegram-bridge-contract";

function comparableTitle(value: string) {
  return value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("hy");
}

function plainInline(nodes: BridgeRichInline[]): string {
  return nodes.map((node) => node.type === "text" ? node.text
    : node.type === "line-break" ? " "
    : node.type === "custom-emoji" ? node.alt
    : node.type === "unsupported" ? ""
    : plainInline(node.children)).join("");
}

/** True when the first rich block only repeats the page title already shown in the header. */
export function richContentStartsWithTitle(value: BridgeRichContent, title: string) {
  const first = value.blocks[0];
  if (!first || (first.type !== "heading" && first.type !== "paragraph")) return false;
  const expected = comparableTitle(title);
  return expected.length > 0 && comparableTitle(plainInline(first.content)) === expected;
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
