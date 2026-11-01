import assert from "node:assert/strict";
import test from "node:test";

import { archiveBefore, longestStreak, monthToShow, periodRange, sundayToAsk, yearToShow } from "../app/utils/liturgy";

// Երևանի ժամը UTC+4 է։
const at = (iso: string) => Date.parse(iso);

test("the Sunday question opens at 13:00 and stays through Monday", () => {
  assert.equal(sundayToAsk(at("2026-11-08T08:59:00Z")), null); // կիրակի 12:59
  assert.equal(sundayToAsk(at("2026-11-08T09:00:00Z")), "2026-11-08"); // կիրակի 13:00
  assert.equal(sundayToAsk(at("2026-11-09T19:00:00Z")), "2026-11-08"); // երկուշաբթի 23:00
  assert.equal(sundayToAsk(at("2026-11-09T20:00:00Z")), null); // երեքշաբթի 00:00
});

test("months and years", () => {
  assert.deepEqual(periodRange("2026-02"), { from: "2026-02-01", to: "2026-02-28", kind: "month" });
  assert.deepEqual(periodRange("2026"), { from: "2026-01-01", to: "2026-12-31", kind: "year" });
  assert.equal(periodRange("2026-13"), null);
  assert.equal(monthToShow(at("2026-12-03T10:00:00Z")), "2026-11");
  assert.equal(monthToShow(at("2026-12-08T10:00:00Z")), null);
  assert.equal(monthToShow(at("2027-01-02T10:00:00Z")), "2026-12");
  assert.equal(yearToShow(at("2026-12-31T10:00:00Z")), 2026);
  assert.equal(yearToShow(at("2027-01-10T10:00:00Z")), 2026);
  assert.equal(yearToShow(at("2027-01-20T10:00:00Z")), null);
});

test("streaks and the yearly clean-up date", () => {
  assert.equal(longestStreak(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-05", "2026-03-02"]), 3);
  assert.equal(longestStreak([]), 0);
  assert.equal(archiveBefore(at("2027-01-20T10:00:00Z")), "2026-01-01");
  assert.equal(archiveBefore(at("2027-02-01T10:00:00Z")), "2027-01-01");
});
