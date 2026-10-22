const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/gu;

/**
 * The psalm's lines with each numbered verse starting its own line. Telegram posts sometimes carry
 * invisible characters before a number, or two verses on one line ("…բոցը։ 8 Տիրոջ…"); a number
 * inside a line splits it only when it is the next verse number after a sentence end.
 */
export function splitVerses(text: string) {
  const out: string[] = [];
  let last = 0;
  for (const raw of text.split("\n")) {
    let line = raw.replace(INVISIBLE, "").trim();
    if (!line) continue;
    const lead = /^(\d{1,3})(?=[\s.)։,])/u.exec(line);
    if (lead) last = Number(lead[1]);
    for (;;) {
      const next = new RegExp(`([։:.!?»”;])\\s+(${last + 1})(?=[\\s.)])`, "u").exec(line);
      if (!next || !lead && last === 0) break;
      const cut = next.index + next[1].length;
      out.push(line.slice(0, cut).trim());
      line = line.slice(cut).trim();
      last += 1;
    }
    out.push(line);
  }
  return out;
}

/** The verse number a line starts with, or null. */
export function verseNumber(line: string) {
  const match = /^(\d{1,3})(?=[\s.)։,])/u.exec(line);
  return match ? Number(match[1]) : null;
}

export type PsalmLineKind = "label" | "superscription" | "heading" | "verse" | "continuation";

/** A line written in capitals only ("ՏԻՐՈՋ ՕՐԷՆՔԸ"): a heading inside the psalm. */
function isCapitalHeading(line: string) {
  const letters = line.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && line.length <= 90 && letters === letters.toLocaleUpperCase("hy") && letters !== letters.toLocaleLowerCase("hy");
}

/**
 * A psalm laid out by the library's standard, whatever Telegram formatting it came with:
 *  - "(Սաղմոս 18)" — the number label, not shown (the page shows it);
 *  - lines before the first numbered verse — the superscription («Այսուհետեւ՝ սաղմոս Դաւթի»), in italics;
 *  - numbered lines — verses (followed and marked in the recording); unnumbered lines after a verse belong to it;
 *  - capital-letter lines between verses — headings («ՏԻՐՈՋ ՕՐԷՆՔԸ»), not verses.
 */
export function psalmLines(text: string) {
  const lines: Array<{ text: string; kind: PsalmLineKind }> = [];
  let seenVerse = false;
  for (const line of splitVerses(text)) {
    if (!seenVerse && /^\(?\s*սաղմոս\s+\d{1,3}\s*\)?$/iu.test(line)) { lines.push({ text: line, kind: "label" }); continue; }
    if (verseNumber(line) !== null) { seenVerse = true; lines.push({ text: line, kind: "verse" }); continue; }
    if (!seenVerse) { lines.push({ text: line, kind: isCapitalHeading(line) && lines.length === 0 ? "heading" : "superscription" }); continue; }
    lines.push({ text: line, kind: isCapitalHeading(line) ? "heading" : "continuation" });
  }
  return lines;
}

/** A verse line without its leading number: "3 Նա…" → "Նա…". */
export function verseBody(line: string) {
  return line.replace(/^\d{1,3}[\s.)։,]*/u, "").trim();
}

/** The psalm's numbered verses with their text (continuation lines joined to their verse). */
export function psalmVerseList(text: string) {
  const verses: Array<{ number: number; text: string }> = [];
  for (const line of psalmLines(text)) {
    const number = line.kind === "verse" ? verseNumber(line.text) : null;
    if (number) verses.push({ number, text: verseBody(line.text) });
    else if (line.kind === "continuation" && verses.length > 0) verses[verses.length - 1].text += ` ${line.text}`;
  }
  return verses;
}

/** How a verse is named: "Սաղմոս 22:3" for a psalm at a numbered address, else "<title>, 3". */
export function verseLabel(psalmPath: string, title: string, verse: number) {
  const psalm = /\/saghmosner\/(\d{1,3})$/u.exec(psalmPath)?.[1];
  return psalm ? `Սաղմոս ${psalm}:${verse}` : `${title}, ${verse}`;
}
