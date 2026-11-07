import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  applyStyle, editText, mergeParagraphs, newParagraph, paragraphSegments, prayerParagraphs, rangeStyle, sanitizeLayout,
  seedLayout, sourceHash, splitOnBlankLines,
} from "../app/utils/prayer-layout";

const plain = (text: string) => ({ text, entities: [] });

test("թավ/գույն՝ ընտրված տառերին, կրկնակի սեղմումը հանում է", () => {
  let paragraph = newParagraph("Հայր մեր որ յերկինս ես");
  paragraph = applyStyle(paragraph, 0, 4, { type: "bold" });
  assert.deepEqual(paragraph.spans, [{ b: true, from: 0, to: 4 }]);
  paragraph = applyStyle(paragraph, 2, 8, { type: "color", color: "red" });
  assert.deepEqual(paragraph.spans, [{ b: true, from: 0, to: 2 }, { b: true, c: "red", from: 2, to: 4 }, { c: "red", from: 4, to: 8 }]);
  assert.deepEqual(rangeStyle(paragraph, 2, 4), { bold: true, italic: false, color: "red", size: null, font: null });
  paragraph = applyStyle(paragraph, 0, 4, { type: "bold" });
  assert.deepEqual(paragraph.spans, [{ c: "red", from: 2, to: 8 }]);
  paragraph = applyStyle(paragraph, 0, 22, { type: "clear" });
  assert.deepEqual(paragraph.spans, []);
});

test("տեքստի ուղղումը պահում է բառերի ձևերը", () => {
  let paragraph = applyStyle(newParagraph("Հայր մեր որ"), 5, 8, { type: "color", color: "gold" });
  paragraph = editText(paragraph, "Ով Հայր մեր որ");
  assert.equal(paragraph.text, "Ով Հայր մեր որ");
  assert.deepEqual(paragraph.spans, [{ c: "gold", from: 8, to: 11 }]);
  // Ձևավորված բառի ներսում գրածը ժառանգում է նրա ձևը։
  paragraph = editText(paragraph, "Ով Հայր մերը որ");
  assert.deepEqual(paragraph.spans, [{ c: "gold", from: 8, to: 12 }]);
});

test("դատարկ տողը բաժանում է, միացնելը՝ միացնում", () => {
  const paragraph = applyStyle(newParagraph("Գրաբար\n\nՀայր մեր", { initial: true, align: "center" }), 8, 12, { type: "bold" });
  const parts = splitOnBlankLines(paragraph);
  assert.equal(parts.length, 2);
  assert.equal(parts[1].text, "Հայր մեր");
  assert.deepEqual(parts[1].spans, [{ b: true, from: 0, to: 4 }]);
  assert.equal(parts[0].initial, true);
  assert.equal(parts[1].initial, false);
  assert.equal(parts[1].align, "center");
  const merged = mergeParagraphs(parts[0], parts[1]);
  assert.equal(merged.text, "Գրաբար\nՀայր մեր");
  assert.deepEqual(merged.spans, [{ b: true, from: 7, to: 11 }]);
});

test("թռչնատառը՝ միայն «տեքստ» պարբերության առաջին տառին", () => {
  const paragraph = newParagraph("«Հայր մեր»", { initial: true });
  const segments = paragraphSegments(paragraph);
  assert.deepEqual(segments.map((segment) => [segment.text, segment.initial]), [["«", false], ["Հ", true], ["այր մեր»", false]]);
  assert.equal(paragraphSegments({ ...paragraph, kind: "note" }).some((segment) => segment.initial), false);
  assert.equal(segments.map((segment) => segment.text).join(""), paragraph.text);
});

test("ստուգումը մաքրում է սխալ արժեքները", () => {
  assert.equal(sanitizeLayout(null), null);
  assert.equal(sanitizeLayout({ paragraphs: [] }), null);
  assert.equal(sanitizeLayout({ paragraphs: [{ text: 5, spans: [] }] }), null);
  const layout = sanitizeLayout({ paragraphs: [{ text: "Տէր\r\nողորմեա", kind: "evil", align: "center", size: "xxl", initial: "yes", spans: [{ from: -3, to: 99, b: true, c: "blue", s: "xl", onclick: "x" }] }] });
  assert.deepEqual(layout, { v: 2, paragraphs: [{ text: "Տէր\nողորմեա", kind: "text", align: "center", size: "md", initial: false, bold: false, italic: false, font: "book", prayer: true, spans: [{ b: true, s: "xl", from: 0, to: 11 }] }] });
});

test("առաջին տարբերակի (v1) նկարագրությունը մնում է շեղ, «աղոթք»-ը՝ ըստ տեսակի", () => {
  const layout = sanitizeLayout({ v: 1, paragraphs: [
    { text: "Նկարագրություն", kind: "note", italic: false, spans: [] },
    { text: "Հայր մեր", kind: "text", spans: [] },
    { text: "Գրաբար", kind: "title", spans: [] },
  ] });
  assert.deepEqual(layout?.paragraphs.map((paragraph) => [paragraph.italic, paragraph.prayer, paragraph.font]), [[true, false, "book"], [false, true, "book"], [false, false, "book"]]);
  // v2-ում շեղը և աղոթքը հենց պահվածն են։
  const next = sanitizeLayout({ v: 2, paragraphs: [{ text: "Նկարագրություն", kind: "note", italic: false, prayer: true, font: "sans", spans: [] }] });
  assert.deepEqual(next?.paragraphs.map((paragraph) => [paragraph.italic, paragraph.prayer, paragraph.font]), [[false, true, "sans"]]);
  assert.deepEqual(prayerParagraphs(next!).map((paragraph) => paragraph.text), ["Նկարագրություն"]);
});

test("ընտրված բառերի տառատեսակ", () => {
  let paragraph = applyStyle(newParagraph("Հայր մեր"), 0, 4, { type: "font", font: "sans" });
  assert.deepEqual(paragraph.spans, [{ f: "sans", from: 0, to: 4 }]);
  assert.equal(rangeStyle(paragraph, 0, 4).font, "sans");
  assert.deepEqual(paragraphSegments(paragraph).map((segment) => segment.style.f ?? null), ["sans", null]);
  paragraph = applyStyle(paragraph, 0, 4, { type: "font", font: "sans" });
  assert.deepEqual(paragraph.spans, []);
});

test("Telegram-ի տեքստից սկիզբ՝ վերնագիրը հանված, պարբերություններով, թավը պահված", () => {
  const text = "Հայր մեր\n\nԱղոթքը տվել է Տերը։\n\nՀայր մեր, որ երկնքում ես";
  const material = { title: "Հայր մեր", formattedText: { text, entities: [{ type: "bold" as const, offset: 31, length: 4 }] }, formattedCaption: plain(""), richContent: null };
  const layout = seedLayout(material);
  assert.deepEqual(layout.paragraphs.map((paragraph) => paragraph.text), ["Աղոթքը տվել է Տերը։", "Հայր մեր, որ երկնքում ես"]);
  assert.equal(layout.paragraphs[0].initial, true);
  assert.deepEqual(layout.paragraphs[1].spans, [{ b: true, from: 0, to: 4 }]);
  // Telegram-ում տեքստը փոխվելիս նշանը փոխվում է։
  const changed = { ...material, formattedText: plain(`${text}։`) };
  assert.notEqual(sourceHash(material), sourceHash(changed));
  assert.equal(sourceHash(material), sourceHash({ ...material }));
});

test("rich տեքստից սկիզբ", () => {
  const material = {
    title: "Գործ սկսելուց առաջ", formattedText: plain(""), formattedCaption: plain(""),
    richContent: { partial: false, blocks: [
      { type: "paragraph" as const, content: [{ type: "text" as const, text: "Գործ սկսելուց առաջ" }] },
      { type: "paragraph" as const, content: [{ type: "bold" as const, children: [{ type: "text" as const, text: "Գրաբար" }] }] },
      { type: "paragraph" as const, content: [{ type: "text" as const, text: "Տէր Յիսուս" }, { type: "line-break" as const }, { type: "text" as const, text: "Քրիստոս" }] },
    ] },
  };
  const layout = seedLayout(material);
  assert.deepEqual(layout.paragraphs.map((paragraph) => paragraph.text), ["Գրաբար", "Տէր Յիսուս\nՔրիստոս"]);
  assert.deepEqual(layout.paragraphs[0].spans, [{ b: true, from: 0, to: 6 }]);
});

test("migration-ը ստեղծում է աղյուսակը", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0050_material_layouts.sql", "utf8"));
  sqlite.prepare("INSERT INTO material_layouts (chat_id, message_id, layout_json, source_hash, updated_by) VALUES (?, ?, ?, ?, ?)").run("-100", 71, "{}", "h", "u");
  assert.throws(() => sqlite.prepare("INSERT INTO material_layouts (chat_id, message_id, layout_json, source_hash, updated_by) VALUES (?, ?, ?, ?, ?)").run("-100", 71, "{}", "h", "u"));
});
