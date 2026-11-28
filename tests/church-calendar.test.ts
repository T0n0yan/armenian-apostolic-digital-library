import assert from "node:assert/strict";
import test from "node:test";

import { computedFeasts, fastOn, fastPeriods, nearestSunday, todayLine, yearFeasts } from "../app/utils/church-calendar";

test("շարժական տոները՝ Զատկից (2026՝ ապրիլի 5)", () => {
  const feasts = computedFeasts(2026);
  const on = (title: string) => feasts.find((entry) => entry.title.startsWith(title))?.day;
  assert.equal(on("Սուրբ Զատիկ"), "2026-04-05");
  assert.equal(on("Ծաղկազարդ"), "2026-03-29");
  assert.equal(on("Համբարձում"), "2026-05-14");
  assert.equal(on("Հոգեգալուստ"), "2026-05-24");
  assert.equal(on("Պայծառակերպություն"), "2026-07-12");
});

test("Վերափոխումը և Խաչվերացը՝ ամենամոտ կիրակին", () => {
  assert.equal(nearestSunday(2026, 8, 15), "2026-08-16");
  assert.equal(nearestSunday(2026, 9, 14), "2026-09-13");
  assert.equal(new Date(`${nearestSunday(2027, 8, 15)}T00:00:00Z`).getUTCDay(), 0);
});

test("պահքի օրեր", () => {
  assert.equal(fastOn("2026-03-02"), "Մեծ պահք");          // Մեծ պահքի առաջին օրը
  assert.equal(fastOn("2026-04-08"), null);                 // չորեքշաբթի Զատկից հետո
  assert.equal(fastOn("2026-06-03"), "Չորեքշաբթի");         // Հոգեգալուստից հետո
  assert.equal(fastOn("2026-01-09"), null);                 // Ծննդից հետո ութ օր
  assert.equal(fastOn("2026-01-03"), "Ծննդյան պահք");
  assert.ok(fastPeriods(2026).every((period) => period.from <= period.to));
});

test("ձեռքով ուղղումները թաքցնում և ավելացնում են", () => {
  const overrides = [
    { id: 1, day: "2026-02-14", title: "Տյառնընդառաջ", kind: "feast" as const, hide: true },
    { id: 2, day: "2026-02-12", title: "Սուրբ Սարգիս", kind: "feast" as const, hide: false },
    { id: 3, day: "2026-06-03", title: "", kind: "fast" as const, hide: true },
  ];
  const feasts = yearFeasts(2026, overrides);
  assert.ok(!feasts.some((entry) => entry.title === "Տյառնընդառաջ"));
  assert.ok(feasts.some((entry) => entry.title === "Սուրբ Սարգիս" && entry.manual));
  assert.equal(todayLine("2026-06-03", overrides).fast, null);
  assert.deepEqual(todayLine("2026-04-05").feasts, ["Սուրբ Զատիկ"]);
});
