import { insideArmenia, parseCoordinates } from "../utils/places";
import { PLACE_TEXT, relayHeader } from "../utils/support-relay";

type Call = (method: string, body: unknown) => Promise<{ ok?: boolean; result?: unknown }>;
type Reader = { id: number; first_name?: string; last_name?: string; username?: string };
type Target = { chat_id: number; message_thread_id?: number };
type Step = "name" | "location" | "photos" | "notes";
type Draft = { header: number | null; step: Step; submission: number | null };
type Incoming = {
  chat: { id: number }; message_id: number; from: Reader; text?: string; caption?: string;
  location?: { latitude: number; longitude: number };
  photo?: Array<{ file_id: string; width?: number; height?: number }>;
  video?: { file_id: string };
};
type Point = { latitude: number; longitude: number };

// A draft left alone this long is closed: the next message is an ordinary one again.
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PICTURES = 10;

const cancelRow = [{ text: PLACE_TEXT.cancel }];
const KEYBOARDS: Record<Step, unknown> = {
  name: { keyboard: [cancelRow], resize_keyboard: true, is_persistent: true, input_field_placeholder: "Անունը…" },
  // request_location shares the phone's GPS in one tap (Telegram on phones only; desktop users get the 📎 way).
  location: { keyboard: [[{ text: PLACE_TEXT.shareLocation, request_location: true }], cancelRow], resize_keyboard: true, is_persistent: true },
  photos: { keyboard: [[{ text: PLACE_TEXT.next }], cancelRow], resize_keyboard: true, is_persistent: true },
  notes: { keyboard: [[{ text: PLACE_TEXT.skip }], cancelRow], resize_keyboard: true, is_persistent: true, input_field_placeholder: "Ինչ գիտեք այդ տեղի մասին…" },
};
const PROMPTS: Record<Step, string> = { name: PLACE_TEXT.askName, location: PLACE_TEXT.askLocation, photos: PLACE_TEXT.askPhotos, notes: PLACE_TEXT.askNotes };
const noKeyboard = { remove_keyboard: true };

async function readDraft(db: D1Database, reader: number): Promise<Draft | null> {
  const row = await db.prepare("SELECT header_message_id, finished, updated_at, submission_id, step FROM bot_place_drafts WHERE telegram_id = ?")
    .bind(reader).first<{ header_message_id: number | null; finished: number; updated_at: number; submission_id: number | null; step: Step }>();
  if (!row || row.finished) return null;
  if (Date.now() - row.updated_at > DRAFT_TTL_MS) {
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
    return null;
  }
  return { header: row.header_message_id, step: row.step, submission: row.submission_id };
}

function writeDraft(db: D1Database, reader: number, draft: Draft, finished = false) {
  return db.prepare(
    `INSERT INTO bot_place_drafts (telegram_id, header_message_id, finished, updated_at, submission_id, step) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET header_message_id = excluded.header_message_id, finished = excluded.finished,
       updated_at = excluded.updated_at, submission_id = excluded.submission_id, step = excluded.step`,
  ).bind(reader, draft.header, finished ? 1 : 0, Date.now(), draft.submission, draft.step).run();
}

function ask(call: Call, chat: number, step: Step, prefix?: string) {
  return call("sendMessage", { chat_id: chat, text: prefix ? `${prefix}\n\n${PROMPTS[step]}` : PROMPTS[step], reply_markup: KEYBOARDS[step] });
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

/** /place: opens a draft and asks for the name. */
export async function startPlace(call: Call, db: D1Database, chat: number, reader: number) {
  await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
  await writeDraft(db, reader, { header: null, step: "name", submission: null });
  await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.start });
  await ask(call, chat, "name");
}

/** Copies the reader's message under the submission's header in the places topic. */
function relay(call: Call, target: Target, draft: Draft, message: Incoming) {
  if (!draft.header) return Promise.resolve();
  return call("copyMessage", { ...target, from_chat_id: message.chat.id, message_id: message.message_id, reply_parameters: { message_id: draft.header } });
}

/**
 * A message while a draft is open: the answer to the current step, «Չեղարկել», or something the
 * step doesn't take (the step's question is asked again). Returns false when no draft is open.
 */
export async function continuePlace(call: Call, db: D1Database, target: Target, message: Incoming, fetcher: typeof fetch = fetch) {
  const reader = message.from.id;
  const draft = await readDraft(db, reader);
  if (!draft) return false;
  const chat = message.chat.id;
  const text = message.text?.trim() ?? "";

  if (text === PLACE_TEXT.cancel) {
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
    if (draft.submission) await db.prepare("UPDATE place_submissions SET status = 'dismissed', handled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(draft.submission).run();
    if (draft.header) await call("sendMessage", { ...target, text: "✖️ Չեղարկեց", reply_parameters: { message_id: draft.header } });
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.cancelled, reply_markup: noKeyboard });
    return true;
  }

  if (draft.step === "name") {
    if (!text || text.startsWith("/")) return ask(call, chat, "name").then(() => true);
    const name = text.slice(0, 120);
    const sender = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim() || message.from.username || "Անանուն";
    const created = await db.prepare("INSERT INTO place_submissions (telegram_id, sender_name, place_name) VALUES (?, ?, ?) RETURNING id")
      .bind(reader, sender, name).first<{ id: number }>();
    const posted = await call("sendMessage", { ...target, text: `${relayHeader("📍 Սրբավայր", message.from)}\n«${name}»` });
    const header = posted.ok ? (posted.result as { message_id: number }).message_id : null;
    await writeDraft(db, reader, { header, step: "location", submission: created?.id ?? null });
    await ask(call, chat, "location");
    return true;
  }

  if (draft.step === "location") {
    const point = message.location ?? (text ? await pointFromText(text, fetcher) : null);
    if (!point) return call("sendMessage", { chat_id: chat, text: PLACE_TEXT.locationHelp, reply_markup: KEYBOARDS.location }).then(() => true);
    if (!insideArmenia(point.latitude, point.longitude)) return call("sendMessage", { chat_id: chat, text: PLACE_TEXT.outside, reply_markup: KEYBOARDS.location }).then(() => true);
    if (draft.submission) await db.prepare("UPDATE place_submissions SET latitude = ?, longitude = ? WHERE id = ?").bind(point.latitude, point.longitude, draft.submission).run();
    if (draft.header) await call("sendLocation", { ...target, latitude: point.latitude, longitude: point.longitude, reply_parameters: { message_id: draft.header } });
    await writeDraft(db, reader, { ...draft, step: "photos" });
    await ask(call, chat, "photos", PLACE_TEXT.locationDone);
    return true;
  }

  if (draft.step === "photos") {
    if (text === PLACE_TEXT.next) {
      await writeDraft(db, reader, { ...draft, step: "notes" });
      await ask(call, chat, "notes");
      return true;
    }
    const photo = message.photo?.length ? message.photo[message.photo.length - 1].file_id : null;
    const video = message.video?.file_id ?? null;
    if (!photo && !video) return call("sendMessage", { chat_id: chat, text: PLACE_TEXT.photosHelp, reply_markup: KEYBOARDS.photos }).then(() => true);
    // Atomic, since an album arrives as several messages at once: no row back means the limit is reached.
    const row = draft.submission ? await db.prepare(
      `UPDATE place_submissions SET
         photos_json = CASE WHEN ?1 IS NULL THEN photos_json ELSE json_insert(photos_json, '$[#]', ?1) END,
         videos_json = CASE WHEN ?2 IS NULL THEN videos_json ELSE json_insert(videos_json, '$[#]', ?2) END
       WHERE id = ?4 AND json_array_length(photos_json) + json_array_length(videos_json) < ?3
       RETURNING json_array_length(photos_json) + json_array_length(videos_json) AS count`,
    ).bind(photo, video, MAX_PICTURES, draft.submission).first<{ count: number }>() : null;
    if (!row) return true;
    await relay(call, target, draft, message);
    // Only the first picture and the last one allowed get an answer, not every picture of an album.
    if (row.count === 1) await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.photoReceived, reply_markup: KEYBOARDS.photos });
    if (row.count === MAX_PICTURES) await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.tooMany });
    await writeDraft(db, reader, draft);
    return true;
  }

  // Notes: one message, or «Բաց թողնել»; then the reader is asked whether to credit them.
  const words = text === PLACE_TEXT.skip ? "" : (message.text ?? message.caption ?? "").trim();
  if (!words && text !== PLACE_TEXT.skip) return call("sendMessage", { chat_id: chat, text: PLACE_TEXT.notesHelp, reply_markup: KEYBOARDS.notes }).then(() => true);
  if (words) {
    if (draft.submission) await db.prepare("UPDATE place_submissions SET notes = ? WHERE id = ?").bind(words.slice(0, 4000), draft.submission).run();
    await relay(call, target, draft, message);
  }
  await writeDraft(db, reader, draft, true);
  await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.done, reply_markup: noKeyboard });
  await call("sendMessage", {
    chat_id: chat,
    text: PLACE_TEXT.askCredit,
    reply_markup: { inline_keyboard: [[{ text: "Այո", callback_data: "place:named" }, { text: "Ոչ, անանուն", callback_data: "place:anonymous" }]] },
  });
  return true;
}

/** The reader's answer to «նշե՞նք ձեր անունը»: noted in the topic, and the draft is closed. */
export async function answerPlaceName(call: Call, db: D1Database, target: Target, query: { id: string; data?: string; from: Reader; message?: { chat: { id: number }; message_id: number } }) {
  const named = query.data === "place:named";
  const row = await db.prepare("SELECT header_message_id, submission_id FROM bot_place_drafts WHERE telegram_id = ? AND finished = 1")
    .bind(query.from.id).first<{ header_message_id: number | null; submission_id: number | null }>();
  await call("answerCallbackQuery", { callback_query_id: query.id });
  if (query.message) {
    await call("editMessageText", { chat_id: query.message.chat.id, message_id: query.message.message_id, text: named ? PLACE_TEXT.named : PLACE_TEXT.anonymous });
  }
  if (!row) return;
  if (row.header_message_id) await call("sendMessage", { ...target, text: `✅ Ավարտեց · անունը նշել կայքում՝ ${named ? "այո" : "ոչ (անանուն)"}\nԱռաջարկը՝ /admin/places`, reply_parameters: { message_id: row.header_message_id } });
  if (row.submission_id) await db.prepare("UPDATE place_submissions SET credit = ? WHERE id = ?").bind(named ? 1 : 0, row.submission_id).run();
  await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(query.from.id).run();
}
