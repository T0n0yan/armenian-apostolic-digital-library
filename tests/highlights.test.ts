import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { anchorFor, cleanEmoji, findQuote, highlightCopyText } from "../app/utils/highlights";
import { createHighlight, deleteHighlight, listHighlights, listMaterialHighlights, openQuestionCount, updateHighlight } from "../app/data/highlights.server";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE app_users (id TEXT PRIMARY KEY);");
  sqlite.exec(readFileSync("migrations/0047_highlights.sql", "utf8"));
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    run: async () => { sqlite.prepare(sql).run(...(values as never[])); return { success: true }; },
    first: async <T>() => (sqlite.prepare(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(values as never[])) as T[] }),
  });
  return { db: { prepare: (sql: string) => statement(sql) } as unknown as D1Database, sqlite };
}

test("findQuote picks the occurrence whose surrounding words match", () => {
  const text = "Տէրն է իմ հովիւը։ Ոչինչ չի պակասի։\nՏէրն է իմ հովիւը, և ես չեմ վախենայ։";
  const second = text.lastIndexOf("Տէրն է իմ հովիւը");
  const anchor = anchorFor(text, second, second + "Տէրն է իմ հովիւը".length);
  assert.equal(anchor.quote, "Տէրն է իմ հովիւը");
  assert.deepEqual(findQuote(text, anchor), { start: second, end: second + anchor.quote.length });
  assert.equal(findQuote(text, { quote: "չկա այսպիսի տող", prefix: "", suffix: "" }), null);
});

test("anchorFor trims spaces at the edges of a selection", () => {
  const anchor = anchorFor("ա  բարի խոսք  բ", 1, 14);
  assert.equal(anchor.quote, "բարի խոսք");
});

test("cleanEmoji accepts emoji only", () => {
  assert.equal(cleanEmoji("🙏"), "🙏");
  assert.equal(cleanEmoji(" ❤️ "), "❤️");
  assert.equal(cleanEmoji(""), "");
  assert.equal(cleanEmoji("բարև"), null);
  assert.equal(cleanEmoji("1"), null);
  assert.equal(cleanEmoji(5), null);
});

test("copy text: quote, title, link", () => {
  assert.equal(highlightCopyText({ quote: "Երանի\nնրանց", title: "Օրվա ընթերցում", path: "/daily/1" }, "https://apostolic.am"), "«Երանի նրանց»\n— Օրվա ընթերցում\nhttps://apostolic.am/daily/1");
});

test("highlights store: create, dedupe, question answered, delete", async () => {
  const { db, sqlite } = database();
  sqlite.exec("INSERT INTO app_users (id) VALUES ('u1'), ('u2')");
  const base = { chatId: "-100", messageId: 7, quote: "Երանի խաղաղարարներին", prefix: "", suffix: "", emoji: "", note: "", section: "Օրվա ընթերցումներ", title: "Ավետարան", path: "/daily/7" };
  const mark = await createHighlight(db, "u1", { ...base, kind: "mark" });
  assert.ok(mark);
  const again = await createHighlight(db, "u1", { ...base, kind: "mark" });
  assert.equal(again?.id, mark.id);
  const question = await createHighlight(db, "u1", { ...base, quote: "Աստծու որդիներ", kind: "question", note: "Ինչո՞ւ" });
  assert.ok(question);
  assert.equal(await openQuestionCount(db, "u1"), 1);
  const answered = await updateHighlight(db, "u1", question.id, { answered: true, answer: "Քանի որ…", emoji: "🙏" });
  assert.ok(answered?.answeredAt);
  assert.equal(answered?.emoji, "🙏");
  assert.equal(await openQuestionCount(db, "u1"), 0);
  // Ուրիշի նշումը չի փոխվում և չի երևում։
  assert.equal(await updateHighlight(db, "u2", mark.id, { note: "x" }), null);
  assert.equal((await listHighlights(db, "u2")).length, 0);
  assert.equal((await listMaterialHighlights(db, "u1", "-100", 7)).length, 2);
  await deleteHighlight(db, "u1", mark.id);
  assert.deepEqual((await listHighlights(db, "u1")).map((item) => item.id), [question.id]);
});
