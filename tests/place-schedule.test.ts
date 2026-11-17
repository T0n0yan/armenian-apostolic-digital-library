import assert from "node:assert/strict";
import test from "node:test";

import { appendLine, normalizeSlot, scheduleLine } from "../app/utils/place-schedule";

test("ժամերի տողը՝ օր + ժամեր ըստ հերթականության", () => {
  assert.equal(scheduleLine("Կիրակի", ["12:00", "10:00"]), "Կիրակի 10:00 և 12:00");
  assert.equal(scheduleLine("Երկուշաբթիից շաբաթ", ["17:00–17:30", "09:30–10:00", "10:00–10:30"]), "Երկուշաբթիից շաբաթ 09:30–10:00, 10:00–10:30 և 17:00–17:30");
  assert.equal(scheduleLine("Տոն օրերին", []), "Տոն օրերին");
});

test("ձեռքով ժամը ուղղվում է", () => {
  assert.equal(normalizeSlot("9:30"), "09:30");
  assert.equal(normalizeSlot("9:30 -18.30"), "09:30–18:30");
  assert.equal(normalizeSlot("25:00"), null);
  assert.equal(normalizeSlot("–"), null);
});

test("նոր տողը ավելանում է մեկ անգամ", () => {
  assert.equal(appendLine("", "Կիրակի 10:00"), "Կիրակի 10:00");
  assert.equal(appendLine("Կիրակի 10:00", "Կիրակի 10:00"), "Կիրակի 10:00");
  assert.equal(appendLine("Կիրակի 10:00", "Շաբաթ 18:00"), "Կիրակի 10:00\nՇաբաթ 18:00");
});
