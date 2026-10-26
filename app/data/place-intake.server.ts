import { insideArmenia, parseCoordinates } from "../utils/places";
import { ACCESS_OPTIONS, PLACE_TEXT, relayHeader } from "../utils/support-relay";

/**
 * /place: a reader sends a church or shrine for the map, one question at a time — name, location,
 * photos, what they know, who serves, the services, access — then their name for the credit. Nothing
 * reaches the team until the reader has seen the whole of it and pressed «Ուղարկել»; every field can
 * be changed or added to from that review, and «Չեղարկել» removes everything.
 */

type Call = (method: string, body: unknown) => Promise<{ ok?: boolean; result?: unknown }>;
type Reader = { id: number; first_name?: string; last_name?: string; username?: string };
type Target = { chat_id: number; message_thread_id?: number };
type Incoming = {
  chat: { id: number }; message_id: number; from: Reader; text?: string; caption?: string;
  location?: { latitude: number; longitude: number };
  photo?: Array<{ file_id: string; width?: number; height?: number }>;
  video?: { file_id: string };
};
type Point = { latitude: number; longitude: number };
type Query = { id: string; data?: string; from: Reader; message?: { chat: { id: number }; message_id: number } };

type TextField = "history" | "clergy" | "services";
type Step = "name" | "location" | "photos" | TextField | "access" | "credit" | "review";
/** null: the questions in order; "edit": one field changed from the review, then back to it. */
type Mode = null | "edit" | "append" | "replace";
type Draft = { step: Step; mode: Mode; submission: number };

type Submission = {
  id: number; place_name: string; latitude: number | null; longitude: number | null; notes: string; clergy: string;
  services: string; accessibility: string; credit: number | null; credit_name: string; photos_json: string; videos_json: string;
};

// A draft left alone this long is dropped (with its unsent submission) by the nightly clean-up.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PICTURES = 10;
const MAX_TEXT = 2000;

const ORDER: Step[] = ["name", "location", "photos", "history", "clergy", "services", "access", "credit", "review"];
const COLUMNS: Record<TextField, string> = { history: "notes", clergy: "clergy", services: "services" };
const FIELD_LABELS: Array<[Step, string]> = [
  ["name", "Անունը"], ["location", "Տեղը"], ["photos", "Լուսանկարները"], ["history", "Պատմությունը"],
  ["clergy", "Ով է ծառայում"], ["services", "Ժամերգությունները"], ["access", "Հասանելիությունը"], ["credit", "Իմ անունը"],
];

const isTextField = (step: Step): step is TextField => step === "history" || step === "clergy" || step === "services";
const cancelRow = [{ text: PLACE_TEXT.cancel }];
const replyKeyboard = (rows: string[][], placeholder?: string) => ({
  keyboard: [...rows.map((row) => row.map((text) => ({ text }))), cancelRow],
  resize_keyboard: true, is_persistent: true, ...(placeholder ? { input_field_placeholder: placeholder } : {}),
});
const noKeyboard = { remove_keyboard: true };
const pictures = (row: Submission) => list(row.photos_json).length + list(row.videos_json).length;

function list(json: string): string[] {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function senderName(reader: Reader) {
  return [reader.first_name, reader.last_name].filter(Boolean).join(" ").trim() || reader.username || "";
}

async function readDraft(db: D1Database, reader: number): Promise<Draft | null> {
  const row = await db.prepare("SELECT step, mode, submission_id, updated_at, finished FROM bot_place_drafts WHERE telegram_id = ?")
    .bind(reader).first<{ step: string; mode: Mode; submission_id: number | null; updated_at: number; finished: number }>();
  if (!row || row.finished || !row.submission_id || !ORDER.includes(row.step as Step) || Date.now() - row.updated_at > DRAFT_TTL_MS) return null;
  return { step: row.step as Step, mode: row.mode, submission: row.submission_id };
}

function writeDraft(db: D1Database, reader: number, draft: Draft) {
  return db.prepare(
    `INSERT INTO bot_place_drafts (telegram_id, header_message_id, finished, updated_at, submission_id, step, mode) VALUES (?, NULL, 0, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET finished = 0, updated_at = excluded.updated_at, submission_id = excluded.submission_id,
       step = excluded.step, mode = excluded.mode`,
  ).bind(reader, Date.now(), draft.submission, draft.step, draft.mode).run();
}

function readSubmission(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM place_submissions WHERE id = ?").bind(id).first<Submission>();
}

/** Removes the reader's draft and, unless it was sent, what they had entered. */
async function discard(db: D1Database, reader: number, draft: Draft | null) {
  await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
  if (draft) await db.prepare("DELETE FROM place_submissions WHERE id = ? AND submitted_at IS NULL").bind(draft.submission).run();
}

/**
 * Coordinates from a pasted link or numbers. Short share links (maps.app.goo.gl, goo.gl/maps) carry
 * none until followed: up to three redirects are read for the full Google Maps address.
 */
export async function pointFromText(text: string, fetcher: typeof fetch = fetch): Promise<Point | null> {
  const direct = parseCoordinates(text);
  if (direct) return direct;
  let url = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\/[^\s]+/u.exec(text)?.[0];
  for (let hop = 0; url && hop < 3; hop += 1) {
    const response = await fetcher(url, { redirect: "manual" }).catch(() => null);
    const next = response?.headers.get("location");
    if (!next) return null;
    const point = parseCoordinates(decodeURIComponent(next));
    if (point) return point;
    url = new URL(next, url).toString();
  }
  return null;
}

/** Asks the question of a step, with the buttons that step takes. */
async function ask(call: Call, db: D1Database, chat: number, reader: Reader, draft: Draft, prefix?: string) {
  const say = (text: string, reply_markup: unknown) => call("sendMessage", { chat_id: chat, text: prefix ? `${prefix}\n\n${text}` : text, reply_markup });
  const editing = draft.mode !== null;
  // Changing one field from the review: «Հետ» returns to it unchanged instead of skipping on.
  const back = editing ? [[PLACE_TEXT.back]] : [];
  switch (draft.step) {
    case "name": return say(PLACE_TEXT.askName, replyKeyboard(back, "Անունը…"));
    case "location": return say(PLACE_TEXT.askLocation, {
      keyboard: [[{ text: PLACE_TEXT.shareLocation, request_location: true }], ...back.map((row) => row.map((text) => ({ text }))), cancelRow],
      resize_keyboard: true, is_persistent: true,
    });
    case "photos": return editing
      ? say(PLACE_TEXT.editPhotos, replyKeyboard([[PLACE_TEXT.ready], [PLACE_TEXT.clearPhotos]]))
      : say(PLACE_TEXT.askPhotos, replyKeyboard([[PLACE_TEXT.next], [PLACE_TEXT.noPhotos]]));
    case "history": return say(PLACE_TEXT.askHistory, replyKeyboard(editing ? back : [[PLACE_TEXT.skip]], "Ինչ գիտեք այս տեղի մասին…"));
    case "clergy": return say(PLACE_TEXT.askClergy, replyKeyboard(editing ? back : [[PLACE_TEXT.skip]], "Հոգևորականի անունը…"));
    case "services": return say(PLACE_TEXT.askServices, replyKeyboard(editing ? back : [[PLACE_TEXT.skip]], "Ժամերգությունների ժամերը…"));
    case "access": return say(PLACE_TEXT.askAccess, replyKeyboard([ACCESS_OPTIONS.slice(0, 2), ACCESS_OPTIONS.slice(2), ...back]));
    case "credit": {
      const name = senderName(reader);
      return say(PLACE_TEXT.askCredit, replyKeyboard([...(name ? [[`Այո՝ «${name}»`]] : []), [PLACE_TEXT.anonymous], ...back], "Կամ գրեք անունը…"));
    }
    case "review": return showReview(call, db, chat, draft);
  }
}

/** Moves to the next question, or back to the review when a field was being changed. */
async function advance(call: Call, db: D1Database, chat: number, reader: Reader, draft: Draft, prefix?: string) {
  const next: Draft = draft.mode !== null || draft.step === "review"
    ? { ...draft, step: "review", mode: null }
    : { ...draft, step: ORDER[ORDER.indexOf(draft.step) + 1] };
  await writeDraft(db, reader.id, next);
  if (next.step === "review" && prefix) await call("sendMessage", { chat_id: chat, text: prefix, reply_markup: noKeyboard });
  await ask(call, db, chat, reader, next, next.step === "review" ? undefined : prefix);
}

/** Letters, but none of them Armenian: «Surb Gayane», «Сурб Гаяне». */
export const notArmenian = (text: string) => /\p{L}/u.test(text) && !/\p{Script=Armenian}/u.test(text);

const short = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

/** The whole submission as text: for the reader's review and for the team. */
export function describeSubmission(row: Submission, limit = 700, forTeam = false) {
  const photos = list(row.photos_json).length;
  const videos = list(row.videos_json).length;
  const lines = [
    `📍 «${row.place_name}»`,
    row.latitude === null || row.longitude === null ? "🗺 Տեղը՝ նշված չէ" : forTeam ? `🗺 Տեղը՝ ${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}` : "🗺 Տեղը՝ նշված է ✓",
    `📷 Լուսանկարներ՝ ${photos}${videos ? `, տեսանյութ՝ ${videos}` : ""}`,
    `📜 Պատմությունը՝ ${row.notes ? short(row.notes, limit) : "—"}`,
    `🙏 Ծառայում է՝ ${row.clergy ? short(row.clergy, limit) : "—"}`,
    `🕯 Ժամերգությունները՝ ${row.services ? short(row.services, limit) : "—"}`,
    `♿ Հասանելիությունը՝ ${row.accessibility || "—"}`,
    `👤 Անունը կայքում՝ ${row.credit ? `«${row.credit_name}»` : "չի նշվի (անանուն)"}`,
  ];
  return lines.join("\n\n");
}

const reviewButtons = {
  inline_keyboard: [
    [{ text: "✅ Ուղարկել", callback_data: "place:send" }],
    [{ text: "✏️ Փոխել կամ լրացնել", callback_data: "place:edit" }],
    [{ text: "✖️ Չեղարկել", callback_data: "place:cancel" }],
  ],
};

async function showReview(call: Call, db: D1Database, chat: number, draft: Draft) {
  const row = await readSubmission(db, draft.submission);
  if (!row) return;
  await call("sendMessage", { chat_id: chat, text: `${PLACE_TEXT.reviewTitle}\n\n${describeSubmission(row)}`, reply_markup: reviewButtons });
}

/** /place: starts again from the first question. */
export async function startPlace(call: Call, db: D1Database, chat: number, reader: Reader | number) {
  const from = typeof reader === "number" ? { id: reader } : reader;
  await discard(db, from.id, await readDraft(db, from.id));
  const created = await db.prepare("INSERT INTO place_submissions (telegram_id, sender_name) VALUES (?, ?) RETURNING id")
    .bind(from.id, senderName(from) || "Անանուն").first<{ id: number }>();
  if (!created) return;
  const draft: Draft = { step: "name", mode: null, submission: created.id };
  await writeDraft(db, from.id, draft);
  await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.start });
  await ask(call, db, chat, from, draft);
}

const BUTTONS = new Set<string>([
  PLACE_TEXT.cancel, PLACE_TEXT.next, PLACE_TEXT.skip, PLACE_TEXT.noPhotos, PLACE_TEXT.ready, PLACE_TEXT.clearPhotos,
  PLACE_TEXT.anonymous, PLACE_TEXT.shareLocation, PLACE_TEXT.back, ...PLACE_TEXT.legacy, ...ACCESS_OPTIONS,
]);

/**
 * A message in the bot's chat while a /place draft is open: the answer to the current question.
 * Returns false when no draft is open (the message is an ordinary one) — except a press of one of
 * /place's own buttons left on the keyboard, which is answered here and never reaches the team.
 */
export async function continuePlace(call: Call, db: D1Database, _target: Target, message: Incoming, fetcher: typeof fetch = fetch) {
  const reader = message.from;
  const chat = message.chat.id;
  const text = message.text?.trim() ?? "";
  const draft = await readDraft(db, reader.id);
  if (!draft) {
    if (!BUTTONS.has(text) && !text.startsWith("Այո՝ «")) return false;
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.stale, reply_markup: noKeyboard });
    return true;
  }
  if (text === PLACE_TEXT.cancel) {
    await discard(db, reader.id, draft);
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.cancelled, reply_markup: noKeyboard });
    return true;
  }
  if (text === PLACE_TEXT.back && draft.mode !== null) {
    await advance(call, db, chat, reader, draft, "↩️ Առանց փոփոխության։");
    return true;
  }
  const update = (sql: string, ...values: unknown[]) => db.prepare(`UPDATE place_submissions SET ${sql} WHERE id = ?`).bind(...values, draft.submission).run();
  const again = (text: string) => call("sendMessage", { chat_id: chat, text }).then(() => true);

  switch (draft.step) {
    case "name": {
      if (!text || BUTTONS.has(text)) return ask(call, db, chat, reader, draft).then(() => true);
      if (notArmenian(text)) return again(PLACE_TEXT.armenianOnly);
      await update("place_name = ?", text.slice(0, 120));
      await advance(call, db, chat, reader, draft);
      return true;
    }
    case "location": {
      const point = message.location ?? (text ? await pointFromText(text, fetcher) : null);
      if (!point) return again(PLACE_TEXT.locationHelp);
      if (!insideArmenia(point.latitude, point.longitude)) return again(PLACE_TEXT.outside);
      await update("latitude = ?, longitude = ?", point.latitude, point.longitude);
      await advance(call, db, chat, reader, draft, PLACE_TEXT.locationDone);
      return true;
    }
    case "photos": {
      if (text === PLACE_TEXT.next || text === PLACE_TEXT.noPhotos || text === PLACE_TEXT.ready) {
        await advance(call, db, chat, reader, draft);
        return true;
      }
      if (text === PLACE_TEXT.clearPhotos) {
        await update("photos_json = '[]', videos_json = '[]'");
        return again("🗑 Լուսանկարները ջնջված են։ Ուղարկեք նորերը կամ սեղմեք «✔️ Պատրաստ է»։");
      }
      const photo = message.photo?.length ? message.photo[message.photo.length - 1].file_id : null;
      const video = message.video?.file_id ?? null;
      if (!photo && !video) return again(PLACE_TEXT.photosHelp);
      // Atomic, since an album arrives as several messages at once: no row back means the limit is reached.
      const row = await db.prepare(
        `UPDATE place_submissions SET
           photos_json = CASE WHEN ?1 IS NULL THEN photos_json ELSE json_insert(photos_json, '$[#]', ?1) END,
           videos_json = CASE WHEN ?2 IS NULL THEN videos_json ELSE json_insert(videos_json, '$[#]', ?2) END
         WHERE id = ?4 AND json_array_length(photos_json) + json_array_length(videos_json) < ?3
         RETURNING json_array_length(photos_json) + json_array_length(videos_json) AS count`,
      ).bind(photo, video, MAX_PICTURES, draft.submission).first<{ count: number }>();
      if (!row) return true;
      // Only the first picture and the last one allowed get an answer, not every picture of an album.
      if (row.count === 1) await call("sendMessage", {
        chat_id: chat, text: PLACE_TEXT.photoReceived,
        reply_markup: draft.mode ? replyKeyboard([[PLACE_TEXT.ready], [PLACE_TEXT.clearPhotos]]) : replyKeyboard([[PLACE_TEXT.next]]),
      });
      if (row.count === MAX_PICTURES) await again(PLACE_TEXT.tooMany);
      await writeDraft(db, reader.id, draft);
      return true;
    }
    case "history":
    case "clergy":
    case "services": {
      const column = COLUMNS[draft.step];
      if (text === PLACE_TEXT.skip || text === PLACE_TEXT.next) {
        await advance(call, db, chat, reader, draft);
        return true;
      }
      const words = (message.text ?? message.caption ?? "").trim();
      if (!words || BUTTONS.has(words)) return again(PLACE_TEXT.textHelp);
      if (notArmenian(words)) return again(PLACE_TEXT.armenianOnly);
      if (draft.mode === "replace") await update(`${column} = substr(?, 1, ${MAX_TEXT})`, words);
      else await update(`${column} = substr(CASE WHEN ${column} = '' THEN ? ELSE ${column} || char(10) || ? END, 1, ${MAX_TEXT})`, words, words);
      // Changing from the review: one message, then back to it. In order: more can follow.
      if (draft.mode) {
        await advance(call, db, chat, reader, draft, "✍️ Պահպանված է։");
        return true;
      }
      await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.textAdded, reply_markup: replyKeyboard([[PLACE_TEXT.next]]) });
      await writeDraft(db, reader.id, draft);
      return true;
    }
    case "access": {
      const words = (message.text ?? "").trim();
      if (!words) return again(PLACE_TEXT.textHelp);
      if (notArmenian(words)) return again(PLACE_TEXT.armenianOnly);
      await update("accessibility = ?", words === "Չգիտեմ" ? "" : words.slice(0, 300));
      await advance(call, db, chat, reader, draft);
      return true;
    }
    case "credit": {
      const words = text.slice(0, 60);
      if (!words) return ask(call, db, chat, reader, draft).then(() => true);
      const named = words !== PLACE_TEXT.anonymous;
      const name = /^Այո՝ «(.+)»$/u.exec(words)?.[1] ?? words;
      await update("credit = ?, credit_name = ?", named ? 1 : 0, named ? name : "");
      await advance(call, db, chat, reader, draft, PLACE_TEXT.reviewIntro);
      return true;
    }
    case "review":
      // The review waits for its buttons; anything typed shows it again.
      await showReview(call, db, chat, draft);
      return true;
  }
}

/** Posts a sent submission in the team's places topic: the details, the pin, then the pictures. */
async function deliver(call: Call, target: Target, row: Submission, from: Reader) {
  const header = relayHeader("📍 Սրբավայր", from);
  const posted = await call("sendMessage", { ...target, text: short(`${header}\n\n${describeSubmission(row, 900, true)}\n\nԱռաջարկը՝ /admin/places`, 4096) });
  const reply = posted.ok ? { reply_parameters: { message_id: (posted.result as { message_id: number }).message_id } } : {};
  if (row.latitude !== null && row.longitude !== null) await call("sendLocation", { ...target, latitude: row.latitude, longitude: row.longitude, ...reply });
  const media = [...list(row.photos_json).map((media) => ({ type: "photo", media })), ...list(row.videos_json).map((media) => ({ type: "video", media }))];
  if (media.length === 1) await call(media[0].type === "photo" ? "sendPhoto" : "sendVideo", { ...target, [media[0].type]: media[0].media, ...reply });
  else if (media.length > 1) await call("sendMediaGroup", { ...target, media: media.slice(0, MAX_PICTURES), ...reply });
}

/** The review's buttons (place:send, place:edit, place:cancel, place:back, place:field:<step>, place:text:<mode>). */
export async function answerPlaceCallback(call: Call, db: D1Database, target: Target, query: Query) {
  const data = query.data ?? "";
  const chat = query.message?.chat.id ?? query.from.id;
  const messageId = query.message?.message_id;
  const draft = await readDraft(db, query.from.id);
  const edit = (text: string, reply_markup?: unknown) => messageId
    ? call("editMessageText", { chat_id: chat, message_id: messageId, text, ...(reply_markup ? { reply_markup } : {}) })
    : Promise.resolve();
  if (!draft) {
    await call("answerCallbackQuery", { callback_query_id: query.id, text: PLACE_TEXT.stale, show_alert: true });
    if (messageId) await call("editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    return;
  }
  await call("answerCallbackQuery", { callback_query_id: query.id });

  if (data === "place:cancel") {
    await discard(db, query.from.id, draft);
    await edit("✖️ Չեղարկված է։");
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.cancelled, reply_markup: noKeyboard });
    return;
  }
  if (data === "place:send") {
    const row = await readSubmission(db, draft.submission);
    if (!row || draft.step !== "review") return;
    await db.prepare("UPDATE place_submissions SET submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(row.id).run();
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(query.from.id).run();
    await edit(`✅ Ուղարկված է\n\n${describeSubmission(row)}`);
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.sent, reply_markup: noKeyboard });
    await deliver(call, target, row, query.from);
    return;
  }
  if (data === "place:edit") {
    const rows = [];
    for (let index = 0; index < FIELD_LABELS.length; index += 2) {
      rows.push(FIELD_LABELS.slice(index, index + 2).map(([step, label]) => ({ text: label, callback_data: `place:field:${step}` })));
    }
    await edit(PLACE_TEXT.chooseField, { inline_keyboard: [...rows, [{ text: "← Հետ", callback_data: "place:back" }]] });
    return;
  }
  if (data === "place:back") {
    const row = await readSubmission(db, draft.submission);
    await writeDraft(db, query.from.id, { ...draft, step: "review", mode: null });
    if (row) await edit(`${PLACE_TEXT.reviewTitle}\n\n${describeSubmission(row)}`, reviewButtons);
    return;
  }
  const field = /^place:field:([a-z]+)$/u.exec(data)?.[1] as Step | undefined;
  if (field && FIELD_LABELS.some(([step]) => step === field)) {
    await edit(`✏️ ${FIELD_LABELS.find(([step]) => step === field)?.[1]}`);
    if (isTextField(field)) {
      const row = await readSubmission(db, draft.submission);
      const current = row?.[COLUMNS[field] as "notes" | "clergy" | "services"] ?? "";
      await writeDraft(db, query.from.id, { ...draft, step: field, mode: "edit" });
      if (!current) {
        await writeDraft(db, query.from.id, { ...draft, step: field, mode: "append" });
        await ask(call, db, chat, query.from, { ...draft, step: field, mode: "append" });
        return;
      }
      await call("sendMessage", {
        chat_id: chat, text: `${PLACE_TEXT.editText}\n\n${short(current, 3500)}`,
        reply_markup: { inline_keyboard: [
          [{ text: "➕ Ավելացնել", callback_data: "place:text:append" }, { text: "✏️ Գրել նորից", callback_data: "place:text:replace" }],
          [{ text: "🗑 Ջնջել", callback_data: "place:text:clear" }, { text: "← Հետ", callback_data: "place:back" }],
        ] },
      });
      return;
    }
    const next: Draft = { ...draft, step: field, mode: "edit" };
    await writeDraft(db, query.from.id, next);
    await ask(call, db, chat, query.from, next);
    return;
  }
  const textMode = /^place:text:(append|replace|clear)$/u.exec(data)?.[1];
  if (textMode && isTextField(draft.step)) {
    if (textMode === "clear") {
      await db.prepare(`UPDATE place_submissions SET ${COLUMNS[draft.step]} = '' WHERE id = ?`).bind(draft.submission).run();
      await edit("🗑 Ջնջված է։");
      await advance(call, db, chat, query.from, { ...draft, mode: "edit" });
      return;
    }
    const next: Draft = { ...draft, mode: textMode as Mode };
    await writeDraft(db, query.from.id, next);
    if (messageId) await call("editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    await call("sendMessage", { chat_id: chat, text: textMode === "append" ? PLACE_TEXT.writeAppend : PLACE_TEXT.writeReplace, reply_markup: replyKeyboard([[PLACE_TEXT.back]]) });
  }
}
