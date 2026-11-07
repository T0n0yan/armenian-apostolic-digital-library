import assert from "node:assert/strict";
import test from "node:test";

import { MAX_STORY_PAGES, planStory, storyParagraphs, wrapParagraph } from "../app/utils/story-layout";

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

test("կարճ տեքստը մեկ նկար է և մեծ տառով", () => {
  const plan = planStory("Տէր, ողորմեա։", "auto", box, measure);
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.size, 64);
});

test("երկար տեքստը բաժանվում է հավասար էջերի", () => {
  const text = Array.from({ length: 30 }, (_, index) => `${index + 1} ${"բառ ".repeat(25)}`).join("\n");
  const plan = planStory(text, "auto", box, measure);
  assert.ok(plan.pages.length >= 2);
  const heights = plan.pages.map((page) => page.height);
  assert.ok(Math.min(...heights) > Math.max(...heights) * 0.5, "վերջին էջը շատ կարճ չէ");
  for (const page of plan.pages) assert.ok(page.height <= box.bottom - box.top);
});

test("շատ երկար տեքստը նշվում է", () => {
  const text = "բառ ".repeat(6000);
  const plan = planStory(text, "xl", box, measure);
  assert.ok(plan.pages.length > MAX_STORY_PAGES);
  assert.equal(plan.tooLong, true);
});
