import assert from "node:assert/strict";
import test from "node:test";

import { buildGlossaryIndex, findGlossaryWords, lookupWord, normalizeWord, type GlossaryTerm } from "../app/utils/glossary";

const term = (id: number, word: string, forms: string[] = []): GlossaryTerm => ({ id, word, forms, meaning: "", note: "", verified: false, kind: "word" });
const index = buildGlossaryIndex([term(1, "ամբարիշտ", ["ամբարշտ"]), term(2, "փառաբանել"), term(3, "տավիղ"), term(4, "Սիոն"), term(5, "քնար")]);

test("old and new spelling read the same", () => {
  assert.equal(normalizeWord("Տաւիղ"), "տավիղ");
  assert.equal(normalizeWord("Աստուծոյ"), normalizeWord("Աստուծոյ"));
  assert.equal(normalizeWord("Տէր"), "տեր");
  assert.equal(normalizeWord("ողորմութիւն"), "ողորմություն");
});

test("words are found with their endings", () => {
  assert.equal(lookupWord(index, "ամբարիշտները"), 1);
  assert.equal(lookupWord(index, "ամբարշտաց"), 1);
  assert.equal(lookupWord(index, "Ամբարիշտ"), 1);
  assert.equal(lookupWord(index, "փառաբանեցեք"), 2);
  assert.equal(lookupWord(index, "տաւղով"), null);
  assert.equal(lookupWord(index, "տաւիղով"), 3);
  assert.equal(lookupWord(index, "Սիոնի"), 4);
  assert.equal(lookupWord(index, "յամբարիշտս"), 1);
});

test("a word that only starts the same is not taken", () => {
  assert.equal(lookupWord(index, "քնարերգություն"), null);
  assert.equal(lookupWord(index, "ամբար"), null);
});

test("positions in a line of text", () => {
  assert.deepEqual(findGlossaryWords("Երանի այն մարդուն, որ չգնաց ամբարիշտների խորհրդով", index), [{ start: 28, end: 40, termId: 1 }]);
});
