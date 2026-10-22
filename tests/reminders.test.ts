import assert from "node:assert/strict";
import test from "node:test";

import { snoozeReminder } from "../app/data/reminders.server";

/** A database that only records the statements it is asked to run. */
function recordingDatabase() {
  const statements: string[] = [];
  const database = {
    prepare(sql: string) {
      return { bind: () => ({ run: async () => { statements.push(sql.replace(/\s+/gu, " ").trim()); return { meta: { changes: 1 } }; } }) };
    },
  };
  return { database: database as unknown as D1Database, statements };
}

test("a snoozed reminder leaves the bell's list until it rings again", async () => {
  const { database, statements } = recordingDatabase();
  await snoozeReminder(database, { userId: "google:1", telegramId: "google:1", chatId: "-100", messageId: 7 }, 1, Date.parse("2026-10-22T10:00:00Z"));
  assert.ok(statements.some((sql) => sql.startsWith("INSERT INTO reading_reminders")));
  assert.ok(statements.some((sql) => sql.startsWith("DELETE FROM reminder_inbox")));
});
