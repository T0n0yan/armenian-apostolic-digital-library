import assert from "node:assert/strict";
import test from "node:test";
import { loadReminders, notifyRemindersChanged, setRemindersEnabled } from "../app/utils/reminder-store";

test("reminder cache deduplicates reads, invalidates edits, and rejects stale auth responses", async (t) => {
  let count = 0;
  let responseId = "first";
  let delayed: ((value: Response) => void) | undefined;
  const body = (id: string) => Response.json({ reminders: [{ materialId: id, at: "2026-10-28T20:00:00Z" }], missed: [] });
  t.mock.method(globalThis, "fetch", async () => {
    count += 1;
    if (responseId === "delayed") return new Promise<Response>((resolve) => { delayed = resolve; });
    return body(responseId);
  });
  t.after(() => setRemindersEnabled(false));
  setRemindersEnabled(true);
  await Promise.all([loadReminders(), loadReminders()]);
  assert.equal(count, 1);
  assert.equal((await loadReminders())[0].materialId, "first");
  assert.equal(count, 1);
  responseId = "edited";
  notifyRemindersChanged();
  assert.equal((await loadReminders())[0].materialId, "edited");
  assert.equal(count, 2);
  responseId = "delayed";
  const oldRequest = loadReminders({ fresh: true });
  setRemindersEnabled(false);
  setRemindersEnabled(true);
  responseId = "new-session";
  await loadReminders();
  delayed!(body("old-session"));
  await oldRequest;
  assert.equal((await loadReminders())[0].materialId, "new-session");
  responseId = "different-viewer";
  setRemindersEnabled(true, "different-viewer");
  assert.equal((await loadReminders())[0].materialId, "different-viewer", "account switching bypasses the prior viewer's TTL");
});
