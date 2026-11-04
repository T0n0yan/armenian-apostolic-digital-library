import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { anchorFor, cleanEmoji, findQuote, highlightCopyText, mergeSpans, sentenceAt, toggleSentence } from "../app/utils/highlights";
import { createHighlight, deleteHighlight, listHighlights, listMarkedVerses, listMaterialHighlights, openQuestionCount, setVerseMarked, updateHighlight } from "../app/data/highlights.server";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE app_users (id TEXT PRIMARY KEY);
    CREATE TABLE library_topics (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE library_materials (chat_id TEXT, message_id INTEGER, topic_key TEXT);`);
  sqlite.exec(readFileSync("migrations/0026_saved_verses.sql", "utf8"));
  sqlite.exec("INSERT INTO app_users (id) VALUES ('old'); INSERT INTO library_topics VALUES ('t', 'Սաղմոսներ'); INSERT INTO library_materials VALUES ('-1', 22, 't');");
  sqlite.exec("INSERT INTO saved_verses (user_id, chat_id, message_id, verse, verse_text, label, path) VALUES ('old', '-1', 22, 3, 'Տէրն է իմ հովիւը', 'Սաղմոս 22:3', '/psalms/22/3')");
  sqlite.exec(readFileSync("migrations/0047_highlights.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0048_highlight_verses.sql", "utf8"));
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

test("findQuote matches across line breaks (a psalm verse saved as one line)", () => {
  const text = "2. Յույս դրի Տիրոջ վրայ.\nինչո՞ւ էք ասում ինձ";
  const found = findQuote(text, { quote: "Յույս դրի Տիրոջ վրայ. ինչո՞ւ էք", prefix: "", suffix: "" });
  assert.deepEqual(found, { start: 3, end: text.indexOf(" ասում") });
});

test("sentenceAt: from «։» to «։»; «.» and «՞» do not end it, a verse number is left out", () => {
  const text = "\u20292 Տէր, ինչո՞ւ բազմացան ինձ հալածողները, եւ\nշատերը ելան իմ դէմ։\n3 Ես ննջեցի ու քուն մտայ. զարթնեցի, եւ Տէրն իմ ապաւէնն է։";
  const first = sentenceAt(text, text.indexOf("հալածողները"))!;
  assert.equal(text.slice(first.start, first.end), "Տէր, ինչո՞ւ բազմացան ինձ հալածողները, եւ\nշատերը ելան իմ դէմ։");
  const second = sentenceAt(text, text.indexOf("զարթնեցի"))!;
  assert.equal(text.slice(second.start, second.end), "Ես ննջեցի ու քուն մտայ. զարթնեցի, եւ Տէրն իմ ապաւէնն է։");
  // Ցանկացած տեղից և հերթով. նորից սեղմելը հանում է։
  let spans = toggleSentence([], second);
  spans = toggleSentence(spans, first);
  assert.deepEqual(spans, [first, second]);
  assert.equal(mergeSpans(spans, text).length, 1);
  assert.deepEqual(toggleSentence(spans, second), [first]);
});

test("migration 0048 moves saved psalm verses into notes", async () => {
  const { db } = database();
  const [moved] = await listHighlights(db, "old");
  assert.equal(moved.quote, "Տէրն է իմ հովիւը");
  assert.equal(moved.title, "Սաղմոս 22:3");
  assert.equal(moved.path, "/psalms/22");
  assert.equal(moved.section, "Սաղմոսներ");
  assert.equal(moved.verse, 3);
  assert.deepEqual(await listMarkedVerses(db, "old", "-1", 22), [3]);
  await setVerseMarked(db, "old", { chatId: "-1", messageId: 22, verse: 3, quote: "", section: "", title: "", path: "" }, false);
  assert.deepEqual(await listMarkedVerses(db, "old", "-1", 22), []);
});

test("last place: section of a path and «time ago» in Armenian", async () => {
  const { sectionOfPath, timeAgo } = await import("../app/utils/last-place");
  assert.equal(sectionOfPath("/psalms/25"), "psalms");
  const now = Date.parse("2026-11-04T12:00:00Z");
  assert.equal(timeAgo(now - 30_000, now), "հենց հիմա");
  assert.equal(timeAgo(now - 5 * 60_000, now), "5 րոպե առաջ");
  assert.equal(timeAgo(now - 3 * 3_600_000, now), "3 ժամ առաջ");
  assert.equal(timeAgo(now - 26 * 3_600_000, now), "երեկ");
});

test("only one emoji per note; old notes show their first one", async () => {
  const { firstEmoji } = await import("../app/utils/highlights");
  assert.equal(cleanEmoji("😁😁😁"), null);
  assert.equal(cleanEmoji("🕊️"), "🕊️");
  assert.equal(cleanEmoji("👍🏽"), "👍🏽");
  assert.equal(firstEmoji("🕊️🕊️"), "🕊️");
});
