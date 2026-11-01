import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { archiveOldYears, personalSummary, saveSundayAnswer, setSundayPrompt, sundayQuestion, sundayRecipients } from "../app/data/liturgy.server";

/** D1-ի բավականաչափ նմանակ node:sqlite-ի վրա՝ իսկական migration-ներով։ */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE app_users (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL DEFAULT '');
    CREATE TABLE library_topics (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE library_materials (chat_id TEXT, message_id INTEGER, title TEXT, topic_key TEXT);
    CREATE TABLE saved_materials (user_id TEXT, material_id TEXT, saved_at TEXT);
    CREATE TABLE saved_verses (user_id TEXT, saved_at TEXT);
    CREATE TABLE push_subscriptions (user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT);
    CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT);`);
  for (const file of ["0021_reading_log", "0023_reading_log_watch", "0033_place_visits", "0043_liturgy_year"]) sqlite.exec(readFileSync(`migrations/${file}.sql`, "utf8"));
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    run: async () => { sqlite.prepare(sql).run(...(values as never[])); return { success: true }; },
    first: async <T>() => (sqlite.prepare(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(values as never[])) as T[] }),
  });
  const db = { prepare: (sql: string) => statement(sql), batch: async (list: Array<{ run: () => Promise<unknown> }>) => { for (const item of list) await item.run(); return []; } };
  return { db: db as unknown as D1Database, sqlite };
}

const SUNDAY_2PM = Date.parse("2026-11-08T10:00:00Z"); // կիրակի 14:00 Երևան

test("the Sunday question: asked once, not after an answer or «don't ask again»", async () => {
  const { db, sqlite } = database();
  sqlite.exec("INSERT INTO app_users (id, telegram_id) VALUES ('a', '111'), ('b', 'google:x'), ('c', '333')");
  assert.deepEqual(await sundayQuestion(db, "a", SUNDAY_2PM), { day: "2026-11-08", ask: true });
  assert.deepEqual((await sundayRecipients(db, "2026-11-08", "", 10)).map((row) => row.id), ["a", "c"]);
  await saveSundayAnswer(db, "a", "2026-11-08", true, true);
  await setSundayPrompt(db, "c", false);
  assert.equal((await sundayQuestion(db, "a", SUNDAY_2PM)).ask, false);
  assert.equal((await sundayQuestion(db, "c", SUNDAY_2PM)).ask, false);
  assert.deepEqual(await sundayRecipients(db, "2026-11-08", "", 10), []);
  assert.deepEqual(await sundayQuestion(db, "a", Date.parse("2026-11-11T10:00:00Z")), { day: null, ask: false });
});

test("a month and a year add up, and old years become one summary line", async () => {
  const { db, sqlite } = database();
  sqlite.exec(`INSERT INTO app_users (id) VALUES ('a');
    INSERT INTO library_topics VALUES ('t1', 'Սաղմոսներ');
    INSERT INTO library_materials VALUES ('c', 1, 'Սաղմոս 1', 't1'), ('c', 2, 'Սաղմոս 2', 't1');
    INSERT INTO reading_log (user_id, day, chat_id, message_id, kind) VALUES
      ('a', '2026-11-01', 'c', 1, 'read'), ('a', '2026-11-02', 'c', 2, 'listen'), ('a', '2026-11-03', 'c', 1, 'read'), ('a', '2026-12-20', 'c', 1, 'read');`);
  await saveSundayAnswer(db, "a", "2026-11-01", true, true);
  await saveSundayAnswer(db, "a", "2026-11-08", true, false);
  await saveSundayAnswer(db, "a", "2026-11-15", false, true);
  const month = await personalSummary(db, "a", "2026-11");
  assert.equal(month?.liturgies, 2);
  assert.equal(month?.communions, 1);
  assert.equal(month?.read, 2);
  assert.equal(month?.listened, 1);
  assert.equal(month?.longestStreak, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(month?.sections)), [{ name: "Սաղմոսներ", count: 3 }]);
  const year = await personalSummary(db, "a", "2026");
  assert.equal(year?.read, 3);
  assert.equal(year?.months?.[10].liturgies, 2);

  // Հունվարին մանրամասները մնում են, փետրվարի 1-ից՝ ամփոփում և ջնջում։
  assert.equal(await archiveOldYears(db, Date.parse("2027-01-20T10:00:00Z")), 0);
  assert.equal(await archiveOldYears(db, Date.parse("2027-02-01T10:00:00Z")), 1);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM reading_log").get() as { n: number }).n, 0);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM liturgy_marks").get() as { n: number }).n, 0);
  assert.equal((await personalSummary(db, "a", "2026"))?.liturgies, 2);
});
