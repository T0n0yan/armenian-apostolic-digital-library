import assert from "node:assert/strict";
import test from "node:test";

import { MAX_STORY_PAGES, fitCount, joinUnits, planStory, withoutLeadingTitle, storyParagraphs, storyUnits, wrapParagraph } from "../app/utils/story-layout";

// Կեղծ չափում. ամեն տառ՝ չափի կեսը։
const measure = (text: string, size: number) => Array.from(text).length * size * 0.5;
const box = { left: 0, right: 900, top: 0, bottom: 1200 };

test("պարբերությունները առանց դատարկ տողերի", () => {
  assert.deepEqual(storyParagraphs("Ա  բ\n\n  գ \r\n"), ["Ա բ", "գ"]);
});

test("տողերը չեն անցնում լայնությունից", () => {
  const lines = wrapParagraph("բառ ".repeat(80).trim(), 300, 40, measure);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(measure(line, 40) <= 300);
});

test("կարճ տեքստը մեկ նկար է", () => {
  const plan = planStory("Տէր, ողորմեա։", 48, box, measure);
  assert.equal(plan.pages.length, 1);
});

test("երկար տեքստը բաժանվում է հավասար էջերի", () => {
  const text = Array.from({ length: 30 }, (_, index) => `${index + 1} ${"բառ ".repeat(25)}`).join("\n");
  const plan = planStory(text, 46, box, measure);
  assert.ok(plan.pages.length >= 2);
  const heights = plan.pages.map((page) => page.height);
  // Ամեն էջ (բացի վերջինից) լցված է որքան հնարավոր է։
  for (const height of heights.slice(0, -1)) assert.ok(height > (box.bottom - box.top) * 0.8, "էջը լիքն է");
  for (const page of plan.pages) assert.ok(page.height <= box.bottom - box.top);
});

test("շատ երկար տեքստը նշվում է", () => {
  const plan = planStory("բառ ".repeat(6000), 70, box, measure);
  assert.ok(plan.pages.length > MAX_STORY_PAGES);
  assert.equal(plan.tooLong, true);
});

test("նեղ շրջանակում ավելի քիչ հատված է տեղավորվում", () => {
  const units = Array.from({ length: 20 }, (_, index) => `${index + 1} ${"բառ ".repeat(12)}`);
  const fits = (frame: typeof box) => (count: number) => planStory(units.slice(0, count).join("\n"), 45, frame, measure).pages.length === 1;
  const wide = fitCount(units.length, fits(box));
  const narrow = fitCount(units.length, fits({ ...box, right: 450 }));
  assert.ok(wide > narrow && narrow >= 1);
  assert.equal(fitCount(3, () => true), 3);
  assert.equal(fitCount(5, () => false), 1);
});

test("երկար պարբերությունը բաժանվում է նախադասությունների", () => {
  const long = `${"Ա ".repeat(100)}։ ${"Բ ".repeat(100)}։`;
  const units = storyUnits(`Կարճ։\n${long}`);
  assert.equal(units.length, 3);
  assert.equal(units[1].paragraphStart, true);
  assert.equal(units[2].paragraphStart, false);
});

test("ընտրված հատվածները. բաց թողնվածի տեղում «…»", () => {
  const units = [{ text: "Ա", paragraphStart: true }, { text: "Բ", paragraphStart: false }, { text: "Գ", paragraphStart: true }, { text: "Դ", paragraphStart: true }];
  assert.equal(joinUnits(units, new Set([0, 1])), "Ա Բ\n…");
  assert.equal(joinUnits(units, new Set([0, 2])), "Ա\n…\nԳ\n…");
  assert.equal(joinUnits(units, new Set([0, 1, 2, 3])), "Ա Բ\nԳ\nԴ");
});


test("նախադասությունը չի կտրվում շեշտի/բացականչական նշանի վրա", () => {
  const long = `Փա՛ռք Քեզ Տեր, ով բարի ես ${"բառ ".repeat(80)}։ Պարգևի՜ր մեզ ${"խաղաղություն ".repeat(20)}։`;
  const units = storyUnits(long);
  assert.equal(units.length, 2);
  assert.ok(units[0].text.startsWith("Փա՛ռք Քեզ"));
});

test("վերնագիրը հանվում է տեքստի սկզբից", () => {
  assert.equal(withoutLeadingTitle("Խաղաղության աղոթք\nՓա՛ռք Քեզ", "Խաղաղության աղոթք"), "Փա՛ռք Քեզ");
  assert.equal(withoutLeadingTitle("Փա՛ռք Քեզ", "Խաղաղության աղոթք"), "Փա՛ռք Քեզ");
});
