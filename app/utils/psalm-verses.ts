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
