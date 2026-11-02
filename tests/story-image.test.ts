import assert from "node:assert/strict";
import { test } from "node:test";

import { fitStoryText, storyFromMaterial, wrapLines } from "../app/utils/story-image";

// Ամեն տառ՝ չափի կեսը լայնությամբ։
const measure = (line: string, size: number) => line.length * size * 0.5;

test("wrapLines-ը տողը լայնությունից չի անցկացնում", () => {
  const lines = wrapLines("Տէր է հովիւ իմ եւ ոչինչ ինձ պակաս չէ", 200, (line) => measure(line, 20));
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(measure(line, 20) <= 200);
});

test("կարճ տեքստը մեծ տառով, երկարը՝ փոքր և տեղավորված", () => {
  const short = fitStoryText("Տէր է հովիւ իմ", measure);
  assert.equal(short.size, 72);
  const long = fitStoryText("Տէր է հովիւ իմ եւ ոչինչ ինձ պակաս չէ ".repeat(40), measure);
  assert.ok(long.size < 72);
  assert.ok(long.lines.length * long.size * 1.5 <= 1060);
  assert.ok(long.passage.endsWith("…"));
});

test("storyFromMaterial-ը վերնագիրը տեքստում չի կրկնում, հարցը՝ առանց չակերտների", () => {
  const story = storyFromMaterial({ title: "Հայր մեր", section: "Աղոթքներ", text: "Հայր մեր, որ յերկինս ես" });
  assert.equal(story.text, "որ յերկինս ես");
  assert.equal(story.quoted, true);
  assert.equal(storyFromMaterial({ title: "Ո՞վ", section: "", text: "x", question: true }).quoted, false);
});
