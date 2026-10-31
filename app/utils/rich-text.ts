/**
 * A place's story with a little formatting the admin types by hand (the editor's buttons insert it):
 *   ## Վերնագիր        a heading
 *   - կետ  /  • կետ    a bulleted list
 *   1. կետ             a numbered list
 *   **թավ**            bold words
 * Blank lines part paragraphs. Nothing else is read as markup, so ordinary text stays as written.
 */
export type Block = { type: "heading"; text: string } | { type: "paragraph"; text: string } | { type: "bullets"; items: string[] } | { type: "numbers"; items: string[] };

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") }); paragraph = []; };
  for (const raw of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,3}\s+(.+)$/u.exec(line);
    const bullet = /^[-•*]\s+(.+)$/u.exec(line);
    const number = /^\d{1,3}[.)]\s+(.+)$/u.exec(line);
    const last = blocks.at(-1);
    if (!line) flush();
    else if (heading) { flush(); blocks.push({ type: "heading", text: heading[1] }); }
    else if (bullet) { flush(); if (last?.type === "bullets" && !paragraph.length) last.items.push(bullet[1]); else blocks.push({ type: "bullets", items: [bullet[1]] }); }
    else if (number) { flush(); if (last?.type === "numbers") last.items.push(number[1]); else blocks.push({ type: "numbers", items: [number[1]] }); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

