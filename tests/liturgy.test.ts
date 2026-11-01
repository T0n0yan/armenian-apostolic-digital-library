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

test("great feasts on weekdays are asked too", async () => {
  const { easterDay, feastOn, canMarkDay } = await import("../app/utils/liturgy");
  assert.equal(easterDay(2026), "2026-04-05");
  assert.equal(easterDay(2027), "2027-03-28");
  assert.equal(feastOn("2026-04-02"), "Ավագ Հինգշաբթի");
  assert.equal(feastOn("2026-05-14"), "Համբարձում");
  assert.equal(feastOn("2027-01-06"), "Սուրբ Ծնունդ և Աստվածահայտնություն");
  assert.equal(sundayToAsk(Date.parse("2027-01-06T10:00:00Z")), "2027-01-06"); // չորեքշաբթի, Ծնունդ
  assert.equal(sundayToAsk(Date.parse("2027-01-07T10:00:00Z")), "2027-01-06");
  assert.equal(canMarkDay("2026-11-01", Date.parse("2026-11-20T10:00:00Z")), true);
  assert.equal(canMarkDay("2026-10-01", Date.parse("2026-11-20T10:00:00Z")), false);
  assert.equal(canMarkDay("2026-11-21", Date.parse("2026-11-20T10:00:00Z")), false);
});
