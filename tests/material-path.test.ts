import assert from "node:assert/strict";
import test from "node:test";

import { categoryForSection, currentSection, isLibraryPath, materialIdFromShortPath, materialPath, parseItemSegment, sectionPath } from "../app/utils/material-path";

test("materials get short English addresses by section, psalms by their number", () => {
  const id = "material_tg_n1002993860753_364";
  assert.equal(materialPath(id, "Աղոթքներ", { title: "Աղոթք ընտանիքի" }), "/pray/364");
  assert.equal(materialPath(id, "category_psalms", { psalm: 22, title: "ՏԷՐՆ ԻՄ ՀՈՎԻՒՆ Է" }), "/psalms/22");
  assert.equal(materialPath(id, "category_psalms"), "/post/364");
  assert.equal(materialPath(id, "Սրբերի վարքը", { title: "ՍՈՒՐԲ ՍԵԹ ՆԱԽԱՀԱՅՐ" }), "/saints/364");
  assert.equal(materialPath(id, "Ավետարանի ուսուցում"), "/gospel/364");
  assert.equal(materialPath(id, null, { title: "Նոր" }), "/post/364");
  // Posts from another chat keep the long address.
  assert.equal(materialPath("material_tg_n100_5", "Աղոթքներ"), "/materials/material_tg_n100_5");
});

test("new and old addresses resolve: psalm numbers, post numbers, Armenian slugs, short addresses", () => {
  assert.deepEqual(parseItemSegment("psalms", "22"), { psalm: 22 });
  assert.deepEqual(parseItemSegment("saghmosner", "22"), { psalm: 22 });
  assert.deepEqual(parseItemSegment("pray", "71"), { materialId: "material_tg_n1002993860753_71" });
  assert.deepEqual(parseItemSegment("aghotkner", "364-aghotk-yntaniki"), { materialId: "material_tg_n1002993860753_364" });
  assert.deepEqual(parseItemSegment("saghmosner", "364-saghmos"), { materialId: "material_tg_n1002993860753_364" });
  assert.equal(parseItemSegment("pray", "hayr-mer"), null);
  assert.equal(currentSection("srberi-varq"), "saints");
  assert.equal(categoryForSection("hartser"), "category_bible_questions");
  assert.equal(materialIdFromShortPath("pray_364"), "material_tg_n1002993860753_364");
  assert.equal(materialIdFromShortPath("saved"), null);
  assert.ok(isLibraryPath("/psalms") && isLibraryPath("/psalms/22") && isLibraryPath("/psalms/22/6") && isLibraryPath("/pray/71"));
  assert.ok(isLibraryPath("/saghmosner/22") && isLibraryPath("/aghotkner/71-pahpanutyan-aghotk") && isLibraryPath("/day_12"));
  assert.ok(!isLibraryPath("/saved") && !isLibraryPath("/admin") && !isLibraryPath("/psalms/22/6/7"));
  assert.equal(sectionPath({ id: "telegram_topic:-100:83", name: "Սաղմոսներ", slug: "topic-n100-83" }), "/psalms");
  assert.equal(sectionPath({ id: "telegram_topic:-100:9", name: "Նորություններ", slug: "topic-n100-9" }), "/categories/topic-n100-9");
});

test("psalm verses: their text, names and pages", async () => {
  const { psalmVerseList, verseLabel } = await import("../app/utils/psalm-verses");
  const verses = psalmVerseList("Սաղմոս Դաւթի\n1 Տէրն է իմ հովիւը,\nոչինչ չի պակասի ինձ։ 2 Դալար արօտներում\nՏԻՐՈՋ ԳՈՎՔԸ\n3 Նա իմ անձը");
  assert.deepEqual(verses, [
    { number: 1, text: "Տէրն է իմ հովիւը, ոչինչ չի պակասի ինձ։" },
    { number: 2, text: "Դալար արօտներում" },
    { number: 3, text: "Նա իմ անձը" },
  ]);
  assert.equal(verseLabel("/psalms/22", "Սաղմոս 22", 3), "Սաղմոս 22:3");
  assert.equal(verseLabel("/post/364", "Սաղմոս", 3), "Սաղմոս, 3");
  assert.ok(isLibraryPath("/psalms/22/3"));
});
