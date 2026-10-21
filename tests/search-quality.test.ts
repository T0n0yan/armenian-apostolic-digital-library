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

test("psalm verses split on invisible characters and on two verses sharing a line", async () => {
  const { splitVerses, verseNumber } = await import("../app/utils/psalm-verses");
  const psalm5 = "(Սաղմոս 5)\n​\n2 Ակա՛նջ դիր\n4 Աղաչում եմ\n​5 Դու անօրէնութիւն\n​11 Գերեզմանի\n​12 Թող ուրախանան";
  assert.deepEqual(splitVerses(psalm5).map(verseNumber).filter((n) => n !== null), [2, 4, 5, 11, 12]);
  const psalm28 = "7 Տիրոջ ձայնը ճեղքում է կրակի բոցը: 8 Տիրոջ ձայնը ցնցում է անապատը\n9 Տիրոջ ձայնը";
  assert.deepEqual(splitVerses(psalm28).map(verseNumber), [7, 8, 9]);
  // A number that isn't the next verse stays inside the line.
  assert.equal(splitVerses("3 Հազար 5 անգամ։ 7 ոչ").length, 1);
});

test("a whole word beats a word that only starts with it, across classical spelling", () => {
  const love = document([{ kind: "body", value: "Աստուած սէր է, եւ սիրով ապրողը", primary: false, blockId: "block-0" }]);
  const sower = document([{ kind: "title", value: "Սերմնացանի առակը", primary: true, blockId: null }]);
  const query = parseTelegramSearchQuery("Սեր");
  const exact = matchSearchableTelegramDocument(love, query);
  const prefix = matchSearchableTelegramDocument(sower, query);
  assert.ok(exact && prefix);
  assert.ok(exact.rank > prefix.rank, `${exact.rank} > ${prefix.rank}`);
  assert.equal(exact.scoreCategory, "exact-token");
});

test("a psalm lays out by the standard: label, italic superscription, verses and capital headings", async () => {
  const { psalmLines } = await import("../app/utils/psalm-verses");
  const text = "(Սաղմոս 18)\n\nԱյսուհետեւ՝ սաղմոս Դաւթի։\n\n2. Երկինքը պատմում է Աստծու փառքը։\n\n3. Օրը օրուան միտք է հաղորդում։\n4. Չկան բառեր, ոչ էլ խօսքեր։\n\n7. Երկնքի ծայրերից է նրա ծագումը։\n\nՏԻՐՈՋ ՕՐԷՆՔԸ\n\n8. Տիրոջ օրէնքն անբիծ է։\nեւ իմաստուն է դարձնում տհասներին։";
  assert.deepEqual(psalmLines(text).map((line) => line.kind), ["label", "superscription", "verse", "verse", "verse", "verse", "heading", "verse", "continuation"]);
});

test("classical and reformed spellings search as one", async () => {
  const { normalizeTelegramSearchText: n, parseTelegramSearchQuery, matchSearchableText } = await import("../shared/telegram-search");
  const same: Array<[string, string]> = [
    ["ՏԷՐՆ ԻՄ ՀՈՎԻՒՆ Է", "Տերն իմ հովիվն է"],
    ["Աստուած", "Աստված"],
    ["աղօթք", "աղոթք"],
    ["ճշմարտութիւն", "ճշմարտություն"],
    ["կորստեան", "կորստյան"],
    ["մեղաւոր", "մեղավոր"],
    ["եւ", "և"],
    ["վրայ", "վրա"],
    ["Յիսուս", "Հիսուս"],
    ["Հակո՛բ", "Հակոբ"],
  ];
  for (const [classical, reformed] of same) assert.equal(n(classical), n(reformed), `${classical} = ${reformed}`);
  // "հովիվ" finds Psalm 22's "ՏԷՐՆ ԻՄ ՀՈՎԻՒՆ Է" as a word start.
  assert.ok(matchSearchableText("ՏԷՐՆ ԻՄ ՀՈՎԻՒՆ Է", parseTelegramSearchQuery("հովիվ")));
  assert.ok(matchSearchableText("Ողորմեա՛ ինձ, Աստուած", parseTelegramSearchQuery("Աստված")));
});

test("descriptions drop the repeated title, the psalm label and verse numbers", async () => {
  const { describe } = await import("../app/utils/seo");
  const text = "ԻՐԱԿԱՆ ՃՇՄԱՐՏՈՒԹԻՒՆԸ\n\n(Սաղմոս 1)\n\n1 Երանելի է այն մարդը, որն ամբարիշտների խորհրդով չի շարժւում։ 2 Այլ Տիրոջ օրէնքի մէջ է նրա կամքը։ [3] Եւ նա կը լինի";
  const result = describe(text, "", "ԻՐԱԿԱՆ ՃՇՄԱՐՏՈՒԹԻՒՆԸ");
  assert.ok(result.startsWith("Երանելի է այն մարդը"), result);
  assert.ok(!/\b\d\b|\[\d/u.test(result), result);
  assert.ok(result.length <= 160);
});
