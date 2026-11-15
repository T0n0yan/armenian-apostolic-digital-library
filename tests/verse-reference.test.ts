import assert from "node:assert/strict";
import test from "node:test";
import { isVerseReference } from "../app/utils/verse-reference";

/** Տեքստի բոլոր «ժամերը», որոնք Աստվածաշնչի հղում չեն։ */
function times(text: string) {
  const found: string[] = [];
  let previous = -1;
  for (const match of text.matchAll(/(?<![\d:])(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?![\d:])/gu)) {
    const index = match.index ?? 0;
    if (isVerseReference(text, index, match[0].length, previous)) { previous = index + match[0].length; continue; }
    found.push(match[0]);
  }
  return found;
}

test("Աստվածաշնչի հղումները ժամ չեն համարվում", () => {
  assert.deepEqual(times("«Մտեք նեղ դռնով» (Մատթ. 7:13-14, Ղուկ. 13:24)"), []);
  assert.deepEqual(times("Մատթ. 5:3, 6:9 և Հովհ. 3:16"), []);
});

test("Մաշալյանի տեսանյութերի ժամերը մնում են", () => {
  assert.deepEqual(times("Քննարկվում են հետևյալ հարցերը․ 📜\n01:09 Ովքե՞ր են նրանք։\n03:26 Արդյոք…"), ["01:09", "03:26"]);
  assert.deepEqual(times("Վերջ.\n05:57 Ինչո՞ւ անապատում"), ["05:57"]);
  assert.deepEqual(times("1:02:15 — երկար տեսանյութ"), ["1:02:15"]);
});
