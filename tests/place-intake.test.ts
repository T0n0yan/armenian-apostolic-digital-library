import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { answerPlaceName, continuePlace, pointFromText, startPlace } from "../app/data/place-intake.server";
import { insideArmenia, parseCoordinates } from "../app/utils/places";
import { PLACE_TEXT } from "../app/utils/support-relay";
import { removeOldData } from "../app/data/retention.server";

/** Enough of D1 over node:sqlite to run the /place conversation against the real migrations. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE app_users (id TEXT PRIMARY KEY); CREATE TABLE site_presence (visitor_id TEXT PRIMARY KEY, last_seen TEXT);");
  for (const file of ["0028_place_drafts", "0029_places", "0033_place_visits", "0034_place_steps"]) sqlite.exec(readFileSync(`migrations/${file}.sql`, "utf8"));
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    run: async () => { sqlite.prepare(sql).run(...(values as never[])); return { success: true }; },
    first: async <T>() => (sqlite.prepare(sql).get(...(values as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(sql).all(...(values as never[])) as T[] }),
  });
  const db = { prepare: (sql: string) => statement(sql), batch: async (list: Array<{ run: () => Promise<unknown> }>) => { for (const item of list) await item.run(); return []; } };
  return { db: db as unknown as D1Database, sqlite };
}

function telegram() {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let id = 100;
  const call = async (method: string, body: unknown) => { calls.push({ method, body: body as Record<string, unknown> }); return { ok: true, result: { message_id: id++ } }; };
  return { calls, call, texts: () => calls.filter((item) => item.method === "sendMessage" && item.body.chat_id === 7).map((item) => String(item.body.text)) };
}

const reader = { id: 42, first_name: "Անի" };
const topic = { chat_id: -100, message_thread_id: 5 };
let messageId = 1;
const message = (extra: Record<string, unknown>) => ({ chat: { id: 7 }, message_id: messageId++, from: reader, ...extra });

test("coordinates: Google's pin wins over the view centre, and Armenia's border is respected", () => {
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/place/X/@40.1,44.2,15z/data=!3d40.161795!4d44.291395"), { latitude: 40.161795, longitude: 44.291395 });
  assert.equal(insideArmenia(40.1618, 44.2914), true); // Էջմիածին
  assert.equal(insideArmenia(40.6013, 43.0975), false); // Կարս
  assert.equal(insideArmenia(40.1872, 44.5152), true); // Երևան
  assert.equal(insideArmenia(41.7151, 44.8271), false); // Թբիլիսի
});

test("a short Google Maps link is followed to its coordinates", async () => {
  const fetcher = (async (url: string) => new Response(null, { status: 302, headers: { location: url.includes("goo.gl") ? "https://www.google.com/maps/place/Haghpat/@41.0945,44.7118,17z" : "" } })) as unknown as typeof fetch;
  assert.deepEqual(await pointFromText("Ահա https://maps.app.goo.gl/abc123", fetcher), { latitude: 41.0945, longitude: 44.7118 });
  assert.equal(await pointFromText("Հաղպատ", fetcher), null);
});

test("/place walks the reader through name, location, photos and notes", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  await startPlace(tg.call, db, 7, 42);
  assert.equal(tg.texts().at(-1), PLACE_TEXT.askName);

  await continuePlace(tg.call, db, topic, message({ text: "Սուրբ Գայանե" }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.askLocation);
  const keyboard = tg.calls.at(-1)?.body.reply_markup as { keyboard: Array<Array<{ request_location?: boolean }>> };
  assert.equal(keyboard.keyboard[0][0].request_location, true);

  await continuePlace(tg.call, db, topic, message({ text: "չգիտեմ" }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.locationHelp);
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 41.7151, longitude: 44.8271 } }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.outside);
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 40.1585, longitude: 44.2989 } }));
  assert.ok(tg.texts().at(-1)?.endsWith(PLACE_TEXT.askPhotos));

  for (let index = 0; index < 12; index += 1) await continuePlace(tg.call, db, topic, message({ photo: [{ file_id: `small${index}` }, { file_id: `big${index}` }] }));
  assert.equal(tg.texts().filter((text) => text === PLACE_TEXT.photoReceived).length, 1);
  assert.equal(tg.texts().filter((text) => text === PLACE_TEXT.tooMany).length, 1);
  await continuePlace(tg.call, db, topic, message({ text: PLACE_TEXT.next }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.askNotes);
  await continuePlace(tg.call, db, topic, message({ text: "Կառուցվել է 630 թվականին ⚑" }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.askCredit);

  await answerPlaceName(tg.call, db, topic, { id: "q", data: "place:named", from: reader, message: { chat: { id: 7 }, message_id: 1 } });
  const row = sqlite.prepare("SELECT * FROM place_submissions").get() as Record<string, unknown>;
  assert.equal(row.place_name, "Սուրբ Գայանե");
  assert.equal(row.latitude, 40.1585);
  assert.equal(JSON.parse(String(row.photos_json)).length, 10);
  assert.equal(row.notes, "Կառուցվել է 630 թվականին ⚑");
  assert.equal(row.credit, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM bot_place_drafts").get()?.n, 0);
  // The team sees the name, the pin, the photos and the notes under one header.
  assert.ok(tg.calls.some((item) => item.method === "sendLocation" && item.body.chat_id === -100));
  assert.equal(tg.calls.filter((item) => item.method === "copyMessage").length, 11);
  // Once finished, the bot no longer treats the reader's messages as part of the place.
  assert.equal(await continuePlace(tg.call, db, topic, message({ text: "Բարև" })), false);
});

test("«Չեղարկել» ends the conversation at any step", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  await startPlace(tg.call, db, 7, 42);
  await continuePlace(tg.call, db, topic, message({ text: "Հաղպատ" }));
  await continuePlace(tg.call, db, topic, message({ text: PLACE_TEXT.cancel }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.cancelled);
  assert.equal(sqlite.prepare("SELECT status FROM place_submissions").get()?.status, "dismissed");
  assert.equal(await continuePlace(tg.call, db, topic, message({ text: "x" })), false);
});

test("old data is removed: handled submissions after 30 days, staging test data after its days", async () => {
  const { db, sqlite } = database();
  sqlite.exec(`INSERT INTO place_submissions (telegram_id, sender_name, created_at, handled_at) VALUES
    (1, 'old handled', '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z'),
    (2, 'old open', '2020-01-01T00:00:00.000Z', NULL),
    (3, 'new', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
    INSERT INTO site_presence VALUES ('a', '2020-01-01T00:00:00.000Z'), ('b', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`);
  await removeOldData(db);
  assert.deepEqual(sqlite.prepare("SELECT sender_name FROM place_submissions ORDER BY id").all().map((row) => row.sender_name), ["old open", "new"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM site_presence").get()?.n, 2);
  await removeOldData(db, "3");
  assert.deepEqual(sqlite.prepare("SELECT sender_name FROM place_submissions").all().map((row) => row.sender_name), ["new"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM site_presence").get()?.n, 1);
});
