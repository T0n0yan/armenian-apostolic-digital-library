import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { addServant, answerPlaceCallback, continuePlace, pointFromText, startPlace } from "../app/data/place-intake.server";
import { insideArmenia, parseCoordinates } from "../app/utils/places";
import { PLACE_CHOICES, PLACE_TEXT } from "../app/utils/support-relay";
import { removeOldData } from "../app/data/retention.server";

// The map's region lookup (Nominatim) answers from here; a test may swap in its own.
const nominatim = (address: Record<string, string>) => (async () => Response.json({ address })) as unknown as typeof fetch;
globalThis.fetch = nominatim({ state: "Արմավիրի մարզ", city: "Վաղարշապատ" });

/** Enough of D1 over node:sqlite to run the /place conversation against the real migrations. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE app_users (id TEXT PRIMARY KEY); CREATE TABLE site_presence (visitor_id TEXT PRIMARY KEY, last_seen TEXT);");
  for (const file of ["0028_place_drafts", "0029_places", "0032_places_osm", "0033_place_visits", "0034_place_steps", "0035_place_details", "0036_place_questions", "0037_place_region"]) sqlite.exec(readFileSync(`migrations/${file}.sql`, "utf8"));
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

const name = (text: string) => message({ text });
const press = (data: string) => ({ id: `q${messageId++}`, data, from: reader, message: { chat: { id: 7 }, message_id: 900 } });
const toTeam = (tg: ReturnType<typeof telegram>) => tg.calls.filter((item) => item.body.chat_id === -100);

const ends = (tg: ReturnType<typeof telegram>, question: string) => assert.ok(tg.texts().at(-1)?.endsWith(question), `${tg.texts().at(-1)} ≠ ${question}`);

async function upToReview(tg: ReturnType<typeof telegram>, db: D1Database) {
  await startPlace(tg.call, db, 7, reader);
  for (const text of ["Սուրբ Գրիգոր Լուսավորիչ եկեղեցի", "⛪ Եկեղեցի"]) await continuePlace(tg.call, db, topic, name(text));
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 40.1585, longitude: 44.0389 } }));
  await continuePlace(tg.call, db, topic, message({ photo: [{ file_id: "small" }, { file_id: "big" }] }));
  for (const text of [PLACE_TEXT.next, "Այո, գործող է", "Ամեն կիրակի", "Ամեն օր 09:30 և 17:00", PLACE_TEXT.next,
    "Թեմի Առաջնորդ", "Տեր Սիոն Սրբազան", "Քահանա", "Տեր Ա", "Քահանա", "Տեր Բ", PLACE_TEXT.done,
    "Ամեն օր 09:00–18:00", PLACE_TEXT.next, "Կան աստիճաններ", PLACE_TEXT.skip, "Այո՝ «Անի»"]) await continuePlace(tg.call, db, topic, name(text));
}

test("people serving are kept one role to a line", () => {
  let clergy = addServant("", "Թեմի Առաջնորդ", "Տեր Սիոն Սրբազան");
  clergy = addServant(clergy, "Քահանա", "Տեր Ա");
  clergy = addServant(clergy, "Քահանա", "Տեր Բ");
  clergy = addServant(clergy, "Այլ ծառայող", "Դպիր՝ Արմեն");
  assert.equal(clergy, "Թեմի Առաջնորդ՝ Տեր Սիոն Սրբազան\nՔահանա՝ Տեր Ա, Տեր Բ\nԴպիր՝ Արմեն");
});

test("/place asks one thing at a time and sends nothing until the reader confirms", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  await startPlace(tg.call, db, 7, reader);
  ends(tg, PLACE_TEXT.askName);
  await continuePlace(tg.call, db, topic, name("Չգիտեմ"));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.nameUnknown);
  // Latin letters are kept, with a reminder that Armenian ones are wished for.
  await continuePlace(tg.call, db, topic, name("Surb Grigor"));
  assert.ok(tg.texts().at(-1)?.startsWith(PLACE_TEXT.armenianTip));
  ends(tg, PLACE_TEXT.askKind);
  await answerPlaceCallback(tg.call, db, topic, press("place:cancel"));
  await startPlace(tg.call, db, 7, reader);
  await continuePlace(tg.call, db, topic, name("Սուրբ Գրիգոր Լուսավորիչ եկեղեցի"));
  ends(tg, PLACE_TEXT.askKind);
  await continuePlace(tg.call, db, topic, name("⛪ Եկեղեցի"));
  ends(tg, PLACE_TEXT.askLocation);
  assert.ok(tg.texts().at(-1)?.startsWith("3 · "));
  const keyboard = tg.calls.at(-1)?.body.reply_markup as { keyboard: Array<Array<{ request_location?: boolean }>> };
  assert.equal(keyboard.keyboard[0][0].request_location, true);
  await continuePlace(tg.call, db, topic, name("չգիտեմ"));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.locationHelp);
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 41.7151, longitude: 44.8271 } }));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.outside);
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 40.1585, longitude: 44.0389 } }));
  ends(tg, PLACE_TEXT.askPhotos);
  assert.ok(tg.texts().at(-1)?.startsWith(`${PLACE_TEXT.locationDone} Արմավիրի մարզ, Վաղարշապատ`));
  for (let index = 0; index < 12; index += 1) await continuePlace(tg.call, db, topic, message({ photo: [{ file_id: `small${index}` }, { file_id: `big${index}` }] }));
  assert.equal(tg.texts().filter((text) => text === PLACE_TEXT.photoReceived).length, 1);
  assert.equal(tg.texts().filter((text) => text === PLACE_TEXT.tooMany).length, 1);
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.next));
  ends(tg, PLACE_TEXT.askActive);
  await continuePlace(tg.call, db, topic, name("Այո, գործող է"));
  ends(tg, PLACE_TEXT.askLiturgy);
  await continuePlace(tg.call, db, topic, name("Ամեն կիրակի"));
  ends(tg, PLACE_TEXT.askServices);
  // More than one message for the same question: both are kept.
  await continuePlace(tg.call, db, topic, name("Երկուշաբթիից շաբաթ 09:30–10:00"));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.textAdded);
  await continuePlace(tg.call, db, topic, name("և 17:00–17:30"));
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.next));
  ends(tg, PLACE_TEXT.askClergy);
  await continuePlace(tg.call, db, topic, name("Թեմի Առաջնորդ"));
  assert.ok(tg.texts().at(-1)?.includes(PLACE_TEXT.askClergyName));
  await continuePlace(tg.call, db, topic, name("Տեր Սիոն Սրբազան"));
  ends(tg, PLACE_TEXT.askClergyMore);
  for (const text of ["Քահանա", "Տեր Ա", "Քահանա", "Տեր Բ", "Սարկավագ", "Ա սարկավագ"]) await continuePlace(tg.call, db, topic, name(text));
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.done));
  ends(tg, PLACE_TEXT.askHours);
  await continuePlace(tg.call, db, topic, name("Միշտ բաց է"));
  ends(tg, PLACE_TEXT.askAccess);
  await continuePlace(tg.call, db, topic, name("Քարքարոտ արահետ, 200 մ"));
  ends(tg, PLACE_TEXT.askHistory);
  // «Չգիտեմ» skips any question.
  await continuePlace(tg.call, db, topic, name("Չգիտեմ"));
  ends(tg, PLACE_TEXT.askCredit);
  await continuePlace(tg.call, db, topic, name("Այո՝ «Անի»"));
  assert.ok(tg.texts().at(-1)?.startsWith(PLACE_TEXT.reviewTitle));
  assert.equal(toTeam(tg).length, 0);

  await answerPlaceCallback(tg.call, db, topic, press("place:send"));
  const row = sqlite.prepare("SELECT * FROM place_submissions").get() as Record<string, unknown>;
  assert.equal(row.place_name, "Սուրբ Գրիգոր Լուսավորիչ եկեղեցի");
  assert.equal(row.kind, "church");
  assert.equal(row.region, "Արմավիրի մարզ, Վաղարշապատ");
  assert.equal(row.active, "yes");
  assert.equal(row.liturgy, "Ամեն կիրակի");
  assert.equal(row.services, "Երկուշաբթիից շաբաթ 09:30–10:00\nև 17:00–17:30");
  assert.equal(row.clergy, "Թեմի Առաջնորդ՝ Տեր Սիոն Սրբազան\nՔահանա՝ Տեր Ա, Տեր Բ\nՍարկավագ՝ Ա սարկավագ");
  assert.equal(row.open_hours, "Միշտ բաց է");
  assert.equal(row.accessibility, "Քարքարոտ արահետ, 200 մ");
  assert.equal(row.notes, "");
  assert.equal(row.credit_name, "Անի");
  assert.equal(JSON.parse(String(row.photos_json)).length, 10);
  assert.ok(row.submitted_at);
  assert.deepEqual(toTeam(tg).map((item) => item.method), ["sendMessage", "sendLocation", "sendMediaGroup"]);
  assert.equal(tg.texts().at(-1), PLACE_TEXT.sent);
  assert.equal(await continuePlace(tg.call, db, topic, name("Բարև")), false);
});

test("a chapel isn't asked about the Liturgy, and neither is a church that isn't working", async () => {
  for (const [kind, active] of [["Մատուռ", null], ["Վանք", "Ոչ, չի գործում"]] as const) {
    const { db } = database();
    const tg = telegram();
    await startPlace(tg.call, db, 7, reader);
    for (const text of ["Սուրբ Սարգիս", kind]) await continuePlace(tg.call, db, topic, name(text));
    await continuePlace(tg.call, db, topic, message({ location: { latitude: 40.1585, longitude: 44.0389 } }));
    await continuePlace(tg.call, db, topic, name(PLACE_TEXT.noPhotos));
    if (active) await continuePlace(tg.call, db, topic, name(active));
    ends(tg, PLACE_TEXT.askHours);
  }
});

test("from the review any answer can be added to, rewritten or left as it was", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  await upToReview(tg, db);
  assert.ok(tg.texts().at(-1)?.startsWith(PLACE_TEXT.reviewTitle));
  await answerPlaceCallback(tg.call, db, topic, press("place:edit"));
  await answerPlaceCallback(tg.call, db, topic, press("place:field:services"));
  await answerPlaceCallback(tg.call, db, topic, press("place:text:append"));
  await continuePlace(tg.call, db, topic, name("Կիրակի՝ 10:00"));
  assert.equal(sqlite.prepare("SELECT services FROM place_submissions").get()?.services, "Ամեն օր 09:30 և 17:00\nԿիրակի՝ 10:00");
  assert.ok(tg.texts().at(-1)?.startsWith(PLACE_TEXT.reviewTitle));
  await answerPlaceCallback(tg.call, db, topic, press("place:field:name"));
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.back));
  assert.equal(sqlite.prepare("SELECT place_name FROM place_submissions").get()?.place_name, "Սուրբ Գրիգոր Լուսավորիչ եկեղեցի");
  // The people serving: added to by role, until «Վերջ».
  await answerPlaceCallback(tg.call, db, topic, press("place:field:clergy"));
  await answerPlaceCallback(tg.call, db, topic, press("place:text:append"));
  for (const text of ["Սարկավագ", "Ա սարկավագ", PLACE_TEXT.done]) await continuePlace(tg.call, db, topic, name(text));
  assert.equal(sqlite.prepare("SELECT clergy FROM place_submissions").get()?.clergy, "Թեմի Առաջնորդ՝ Տեր Սիոն Սրբազան\nՔահանա՝ Տեր Ա, Տեր Բ\nՍարկավագ՝ Ա սարկավագ");
  assert.ok(tg.texts().at(-1)?.startsWith(PLACE_TEXT.reviewTitle));
  await answerPlaceCallback(tg.call, db, topic, press("place:field:history"));
  await continuePlace(tg.call, db, topic, name("Կառուցվել է 2000 թ."));
  assert.equal(sqlite.prepare("SELECT notes FROM place_submissions").get()?.notes, "Կառուցվել է 2000 թ.");
  await answerPlaceCallback(tg.call, db, topic, press("place:field:credit"));
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.anonymous));
  assert.equal(sqlite.prepare("SELECT credit FROM place_submissions").get()?.credit, 0);
  assert.equal(toTeam(tg).length, 0);
});

test("the kind can be the reader's own words; the region is asked when the map can't find it", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  try {
    await startPlace(tg.call, db, 7, reader);
    for (const text of ["Զվարթնոց", "Հեթանոսական տաճար"]) await continuePlace(tg.call, db, topic, name(text));
    ends(tg, PLACE_TEXT.askLocation);
    // Coordinates typed longitude first are turned round.
    await continuePlace(tg.call, db, topic, name("44.3365, 40.1600"));
    ends(tg, PLACE_TEXT.askRegion);
    await continuePlace(tg.call, db, topic, name("Արմավիրի մարզ, Զվարթնոց"));
    ends(tg, PLACE_TEXT.askPhotos);
    const row = sqlite.prepare("SELECT kind, kind_note, latitude, region FROM place_submissions").get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { kind: "", kind_note: "Հեթանոսական տաճար", latitude: 40.16, region: "Արմավիրի մարզ, Զվարթնոց" });
  } finally {
    globalThis.fetch = saved;
  }
});

test("a place under renovation isn't asked for opening hours; the team gets it in General when the topic is gone", async () => {
  const { db } = database();
  const tg = telegram();
  await startPlace(tg.call, db, 7, reader);
  for (const text of ["Սուրբ Նարեկ", "⛪ Եկեղեցի"]) await continuePlace(tg.call, db, topic, name(text));
  await continuePlace(tg.call, db, topic, message({ location: { latitude: 40.1585, longitude: 44.0389 } }));
  for (const text of [PLACE_TEXT.noPhotos, "Վերանորոգվում է"]) await continuePlace(tg.call, db, topic, name(text));
  ends(tg, PLACE_TEXT.askAccess);
  for (const text of [PLACE_TEXT.unknown, PLACE_TEXT.skip, PLACE_TEXT.anonymous]) await continuePlace(tg.call, db, topic, name(text));
  // The places topic refuses (it doesn't exist): the summary goes to the group itself.
  const refusing = async (method: string, body: unknown) => {
    const thread = (body as { message_thread_id?: number }).message_thread_id;
    return thread ? { ok: false } : tg.call(method, body);
  };
  await answerPlaceCallback(refusing, db, topic, press("place:send"));
  const summary = tg.calls.find((item) => item.body.chat_id === -100 && item.method === "sendMessage");
  assert.equal(summary?.body.message_thread_id, undefined);
  assert.match(String(summary?.body.text), /#u42/u);
  assert.match(String(summary?.body.text), /Reply/u);
});

test("«Չեղարկել» removes everything and tells the team nothing; leftover buttons never reach the team", async () => {
  const { db, sqlite } = database();
  const tg = telegram();
  await startPlace(tg.call, db, 7, reader);
  await continuePlace(tg.call, db, topic, name("Հաղպատ"));
  await continuePlace(tg.call, db, topic, name(PLACE_TEXT.cancel));
  assert.equal(tg.texts().at(-1), PLACE_TEXT.cancelled);
  assert.deepEqual(tg.calls.at(-1)?.body.reply_markup, { remove_keyboard: true });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM place_submissions").get()?.n, 0);
  // The old keyboard's buttons pressed later: answered, the keyboard removed, nothing relayed.
  for (const button of [PLACE_TEXT.cancel, "✅ Ավարտել"]) {
    assert.equal(await continuePlace(tg.call, db, topic, name(button)), true);
    assert.equal(tg.texts().at(-1), PLACE_TEXT.stale);
  }
  await upToReview(tg, db);
  await answerPlaceCallback(tg.call, db, topic, press("place:cancel"));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM place_submissions").get()?.n, 0);
  assert.equal(toTeam(tg).length, 0);
  // A press on an old review after cancelling sends nothing either.
  await answerPlaceCallback(tg.call, db, topic, press("place:send"));
  assert.equal(toTeam(tg).length, 0);
});

test("old data is removed: unsent drafts after a day, handled submissions after 30 days, staging test data after its days", async () => {
  const { db, sqlite } = database();
  sqlite.exec(`INSERT INTO place_submissions (telegram_id, sender_name, created_at, submitted_at, handled_at) VALUES
    (1, 'old handled', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z'),
    (2, 'old open', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
    (4, 'old never sent', '2020-01-01T00:00:00.000Z', NULL, NULL),
    (3, 'new', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
    INSERT INTO site_presence VALUES ('a', '2020-01-01T00:00:00.000Z'), ('b', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`);
  await removeOldData(db);
  assert.deepEqual(sqlite.prepare("SELECT sender_name FROM place_submissions ORDER BY id").all().map((row) => row.sender_name), ["old open", "new"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM site_presence").get()?.n, 2);
  await removeOldData(db, "3");
  assert.deepEqual(sqlite.prepare("SELECT sender_name FROM place_submissions").all().map((row) => row.sender_name), ["new"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM site_presence").get()?.n, 1);
});
