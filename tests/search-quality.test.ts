import assert from "node:assert/strict";
import test from "node:test";

import {
  matchSearchableTelegramDocument,
  parseTelegramSearchQuery,
  searchAliases,
  type SearchableTelegramDocument,
} from "../shared/telegram-search";

function document(fields: SearchableTelegramDocument["fields"]): SearchableTelegramDocument {
  return { chatId: "-100", messageId: 1, topicId: 83, mediaGroupId: null, constituentMessageIds: [1], fields };
}

const psalm = (number: number) => document([
  { kind: "title", value: "ԱՐՏԱՔՍՈՒԱԾ ՂԵՒՏԱՑՈՒ ՈՂԲԸ", primary: true, blockId: null },
  { kind: "audio", value: `Սաղմոս ${number}`, primary: true, blockId: null },
  { kind: "body", value: `(Սաղմոս ${number}) 1 Ինչպէս եղջերուն ջրի ակունքներին է փափագում`, primary: false, blockId: "block-0" },
  { kind: "topic", value: "Սաղմոսներ", primary: false, blockId: null },
]);

test("informal Latin spellings with gh, ou and tch reach Armenian text", () => {
  assert.ok(searchAliases("saghmos").includes("saxmos"));
  assert.ok(searchAliases("saghmos").includes("սաղմոս"));
  assert.ok(searchAliases("aghotq").includes("axotq"));
  for (const query of ["saghmos", "saxmos"]) {
    assert.ok(matchSearchableTelegramDocument(psalm(41), parseTelegramSearchQuery(query)), query);
  }
  assert.ok(matchSearchableTelegramDocument(document([{ kind: "title", value: "Աղոթք", primary: true, blockId: null }]), parseTelegramSearchQuery("aghotq")));
});

test("psalm numbers match exactly instead of by prefix", () => {
  const query = parseTelegramSearchQuery("Սաղմոս 1");
  assert.equal(matchSearchableTelegramDocument(psalm(1), query)?.scoreCategory, "exact-primary");
  // Psalm 14 contains verse "1" and the word "Սաղմոս", but it is not Psalm 1.
  assert.equal(matchSearchableTelegramDocument(psalm(14), query), null);
  assert.equal(matchSearchableTelegramDocument(psalm(41), parseTelegramSearchQuery("սաղմոս 41"))?.scoreCategory, "exact-primary");
});

test("title matches outrank body-only matches within the same rank", () => {
  const query = parseTelegramSearchQuery("աղոթք");
  const titled = matchSearchableTelegramDocument(document([
    { kind: "title", value: "Առավոտյան աղոթք", primary: true, blockId: null },
  ]), query);
  const bodyOnly = matchSearchableTelegramDocument(document([
    { kind: "body", value: "Այս աղոթք կարդացվում է", primary: false, blockId: "block-0" },
  ]), query);
  assert.equal(titled?.rank, bodyOnly?.rank);
  assert.ok((titled?.strength ?? 0) > (bodyOnly?.strength ?? 0));
});

test("Armenian queries are not transliterated and short ones never match inside a word", () => {
  const flowers = document([{ kind: "body", value: "Աստված պատվիրում է ապրել թռչունների և դաշտի ծաղիկների պես", primary: false, blockId: "block-0" }]);
  assert.deepEqual(parseTelegramSearchQuery("Սաղ").aliases, []);
  assert.equal(matchSearchableTelegramDocument(flowers, parseTelegramSearchQuery("Սաղ")), null);
  assert.equal(matchSearchableTelegramDocument(flowers, parseTelegramSearchQuery("sax")), null);
  assert.ok(matchSearchableTelegramDocument(psalm(1), parseTelegramSearchQuery("Սաղ")));
});

test("the sun theme is light by day and dark by night in Yerevan", async () => {
  const { sunTimes, themeBySun } = await import("../shared/theme");
  const times = sunTimes(new Date("2026-06-21T12:00:00Z"), 40.18, 44.51);
  assert.ok(times);
  // Midsummer in Yerevan: sunrise about 05:30 and sunset about 20:40 local time (UTC+4).
  assert.ok(Math.abs(times.sunrise.getUTCHours() * 60 + times.sunrise.getUTCMinutes() - 90) < 20, times.sunrise.toISOString());
  assert.ok(Math.abs(times.sunset.getUTCHours() * 60 + times.sunset.getUTCMinutes() - 1000) < 20, times.sunset.toISOString());
  assert.equal(themeBySun(new Date("2026-06-21T08:00:00Z"), null), "light");
  assert.equal(themeBySun(new Date("2026-06-21T19:00:00Z"), null), "dark");
});
