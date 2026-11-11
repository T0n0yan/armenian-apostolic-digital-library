import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSearchVocabulary, correctSearchQuery, editDistance } from "../shared/search-correction";

const vocabulary = buildSearchVocabulary([
  "Սաղմոս 22", "Սաղմոս 23", "Սաղմոս Դավթի", "Սերմնացանի առակը", "Ողորմյա ինձ, Աստված",
  "Խաղաղության աղոթք", "Սուրբ Գրիգոր Լուսավորիչ", "Աղոթքներ", "Սաղմոսներ",
]);

test("տառերի տարբերություն", () => {
  assert.equal(editDistance("սաղմոս", "սաղմոս"), 0);
  assert.equal(editDistance("ab", "ba"), 1);
  assert.equal(editDistance("abc", "xyz", 1), 2);
});

test("լատինատառը դառնում է հայերեն բառ", () => {
  assert.equal(correctSearchQuery("Saxmos", vocabulary).corrected, "սաղմոս");
  assert.equal(correctSearchQuery("saghmos", vocabulary).corrected, "սաղմոս");
  assert.equal(correctSearchQuery("Sermnacani", vocabulary).corrected, "սերմնացանի");
});

test("տառասխալով բառը ուղղվում է", () => {
  assert.equal(correctSearchQuery("Sermnacnai", vocabulary).corrected, "սերմնացանի");
  assert.equal(correctSearchQuery("սերմնացնաի", vocabulary).corrected, "սերմնացանի");
  assert.equal(correctSearchQuery("xaxaxutyan", vocabulary).corrected, "խաղաղության");
});

test("ճիշտ հայերեն բառը չի փոխվում", () => {
  assert.equal(correctSearchQuery("սաղմոս", vocabulary).corrected, null);
  assert.equal(correctSearchQuery("Սաղմոս 22", vocabulary).corrected, null);
});

test("նման բառեր", () => {
  const { similar } = correctSearchQuery("Serm", vocabulary);
  assert.ok(similar.includes("սերմնացանի"), similar.join(","));
});
