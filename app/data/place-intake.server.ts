import { PLACE_TEXT, relayHeader } from "../utils/support-relay";

type Call = (method: string, body: unknown) => Promise<{ ok?: boolean; result?: unknown }>;
type Reader = { id: number; first_name?: string; last_name?: string; username?: string };
type Target = { chat_id: number; message_thread_id?: number };
type Draft = { header: number | null; finished: boolean };

// A draft left alone this long is closed: the next message is an ordinary one again.
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

const keyboard = { keyboard: [[{ text: PLACE_TEXT.finish }, { text: PLACE_TEXT.cancel }]], resize_keyboard: true, is_persistent: true };
const noKeyboard = { remove_keyboard: true };

async function readDraft(db: D1Database, reader: number): Promise<Draft | null> {
  const row = await db.prepare("SELECT header_message_id, finished, updated_at FROM bot_place_drafts WHERE telegram_id = ?")
    .bind(reader).first<{ header_message_id: number | null; finished: number; updated_at: number }>();
  if (!row) return null;
  if (Date.now() - row.updated_at > DRAFT_TTL_MS) {
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
    return null;
  }
  return { header: row.header_message_id, finished: Boolean(row.finished) };
}

function writeDraft(db: D1Database, reader: number, header: number | null, finished = false) {
  return db.prepare(
    `INSERT INTO bot_place_drafts (telegram_id, header_message_id, finished, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET header_message_id = excluded.header_message_id, finished = excluded.finished, updated_at = excluded.updated_at`,
  ).bind(reader, header, finished ? 1 : 0, Date.now()).run();
}

/** /place: opens a draft and explains what to send. */
export async function startPlace(call: Call, db: D1Database, chat: number, reader: number) {
  await writeDraft(db, reader, null);
  await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.start, reply_markup: keyboard });
}

/**
 * A message while a draft is open: «Ավարտել» / «Չեղարկել», or something for the team, copied
 * under the draft's header in the places topic. Returns false when no draft is open.
 */
export async function continuePlace(call: Call, db: D1Database, target: Target, message: { chat: { id: number }; message_id: number; text?: string; from: Reader }) {
  const reader = message.from.id;
  const draft = await readDraft(db, reader);
  if (!draft || draft.finished) return false;
  const chat = message.chat.id;
  const text = message.text?.trim();

  if (text === PLACE_TEXT.cancel) {
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(reader).run();
    if (draft.header) await call("sendMessage", { ...target, text: "✖️ Չեղարկեց", reply_parameters: { message_id: draft.header } });
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.cancelled, reply_markup: noKeyboard });
    return true;
  }
  if (text === PLACE_TEXT.finish) {
    if (!draft.header) {
      await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.empty });
      return true;
    }
    await writeDraft(db, reader, draft.header, true);
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.done, reply_markup: noKeyboard });
    await call("sendMessage", {
      chat_id: chat,
      text: PLACE_TEXT.askName,
      reply_markup: { inline_keyboard: [[{ text: "Այո", callback_data: "place:named" }, { text: "Ոչ, անանուն", callback_data: "place:anonymous" }]] },
    });
    return true;
  }

  let header = draft.header;
  if (!header) {
    const posted = await call("sendMessage", { ...target, text: relayHeader("📍 Սրբավայր", message.from) });
    header = posted.ok ? (posted.result as { message_id: number }).message_id : null;
    if (!header) return true;
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.received });
  }
  await call("copyMessage", { ...target, from_chat_id: chat, message_id: message.message_id, reply_parameters: { message_id: header } });
  await writeDraft(db, reader, header);
  return true;
}

/** The reader's answer to «նշե՞նք ձեր անունը»: noted in the topic, and the draft is closed. */
export async function answerPlaceName(call: Call, db: D1Database, target: Target, query: { id: string; data?: string; from: Reader; message?: { chat: { id: number }; message_id: number } }) {
  const named = query.data === "place:named";
  const draft = await readDraft(db, query.from.id);
  await call("answerCallbackQuery", { callback_query_id: query.id });
  if (query.message) {
    await call("editMessageText", { chat_id: query.message.chat.id, message_id: query.message.message_id, text: named ? PLACE_TEXT.named : PLACE_TEXT.anonymous });
  }
  if (!draft?.header) return;
  await call("sendMessage", { ...target, text: `✅ Ավարտեց · անունը նշել կայքում՝ ${named ? "այո" : "ոչ (անանուն)"}`, reply_parameters: { message_id: draft.header } });
  await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(query.from.id).run();
}
