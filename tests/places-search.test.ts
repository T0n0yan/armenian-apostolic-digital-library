import assert from "node:assert/strict";
import test from "node:test";

import { blockedWords, placeMatches } from "../app/utils/places";

const narekatsi = { name: "Սուրբ Գրիգոր Նարեկացի եկեղեցի", region: "Արմավիրի մարզ, Էջմիածին" };
const lusavorich = { name: "Սուրբ Գրիգոր Լուսավորիչ մայր տաճար", region: "Երևան, Կենտրոն, Հաղպատ" };

test("places match Armenian words in any order", () => {
  assert.ok(placeMatches(narekatsi, "նարեկացի"));
  assert.ok(placeMatches(narekatsi, "էջմիածին նարեկ"));
  assert.ok(!placeMatches(lusavorich, "նարեկացի"));
});

test("places match the usual Latin and Russian spellings", () => {
  for (const typed of ["Narekatsi", "narekaci", "Echmiadzin", "Etchmiatsin", "ejmiatsin"]) assert.ok(placeMatches(narekatsi, typed), typed);
  for (const typed of ["Lusavorich", "lusavoritch", "Yerevan", "erevan", "Лусаворич", "surb grigor", "Haxpat"]) assert.ok(placeMatches(lusavorich, typed), typed);
  assert.ok(!placeMatches(lusavorich, "Narekatsi"));
  assert.ok(!placeMatches(lusavorich, "!!"));
});

test("the blocklist catches words whatever their case", () => {
  assert.deepEqual(blockedWords("Բեթել եկեղեցի", ["բեթել", "կյանքի խոսք"]), ["բեթել"]);
  assert.deepEqual(blockedWords("Կաթողիկե եկեղեցի", ["հայ կաթողիկե"]), []);
});
