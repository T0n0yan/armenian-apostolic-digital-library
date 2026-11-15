/**
 * Աստվածաշնչի հղում է, ոչ թե ժամ. «Մատթ. 7:13», «Ղուկ. 13:24», «7:13-14», «Մատթ. 5:3, 6:9»։
 * Ժամը (Մաշալյանի տեսանյութերում «01:09 Հարց…») սովորաբար տողի սկզբում է։
 */
export function isVerseReference(text: string, index: number, length: number, previousVerseEnd = -1): boolean {
  const before = text.slice(Math.max(0, index - 24), index);
  const after = text.slice(index + length, index + length + 4);
  if (/\p{L}\.[ \t ]*$/u.test(before)) return true; // գրքի կրճատ անուն՝ վերջակետով
  if (/^[ \t ]*[-–—][ \t ]*\d/u.test(after)) return true; // համարների միջակայք
  if (previousVerseEnd >= 0) return /^[ \t ]*[,;][ \t ]*$/u.test(text.slice(previousVerseEnd, index)); // նույն ցանկի հաջորդ հղումը
  // «Մատթ. 5:3, 6:9»՝ նախորդ հղումը նույն ցանկում
  const list = /(\d{1,3}:\d{1,3})[ \t ]*[,;][ \t ]*$/u.exec(before);
  return list ? isVerseReference(text, index - list[0].length, list[1].length) : false;
}
