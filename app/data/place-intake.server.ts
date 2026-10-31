import { ACTIVE_LABELS, insideArmenia, isPlaceKind, parseCoordinates, PLACE_KINDS } from "../utils/places";
import { clergyExample } from "../utils/clergy-titles";
import { addServant, ENTRANCE, OTHER_ROLE, ROAD, setAccessPart } from "../utils/place-answers";

export { addServant, setAccessPart };
import { PLACE_CHOICES, PLACE_TEXT, readerName, relayHeader } from "../utils/support-relay";

/**
 * /place: a reader sends a church or shrine for the map, one question at a time — name, kind,
 * location, photos; for a church, monastery or complex whether it is working, and if so the Divine
 * Liturgy, the services and who serves there (by role); then opening hours, the way in, what they
 * know, and their name for the credit. Nothing reaches the team until the reader has seen the whole
 * of it and pressed «Ուղարկել»; every answer can be changed or added to from that review, and
 * «Չեղարկել» removes everything.
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

type TextStep = "liturgy" | "services" | "hours" | "history";
type Step = "name" | "kind" | "location" | "region" | "photos" | "active" | TextStep | "clergy" | "access" | "entrance" | "credit" | "review";
/** null: the questions in order; otherwise one answer changed from the review, then back to it. */
type Mode = null | "edit" | "append" | "replace";
type Draft = { step: Step; mode: Mode; submission: number; pending: string | null };

export type Submission = {
  id: number; place_name: string; kind: string; kind_note: string; region: string; latitude: number | null; longitude: number | null; active: string; liturgy: string;
  services: string; clergy: string; open_hours: string; accessibility: string; notes: string; credit: number | null; credit_name: string;
  photos_json: string; videos_json: string;
};

// A draft left alone this long is dropped (with its unsent submission) by the nightly clean-up.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PICTURES = 10;
const MAX_TEXT = 2000;

const ORDER: Step[] = ["name", "kind", "location", "region", "photos", "active", "liturgy", "services", "clergy", "hours", "access", "entrance", "history", "credit", "review"];

/** Free-text questions: their column, question, ready answers and the hint in the input field. */
const TEXTS: Record<TextStep, { column: keyof Submission; ask: string; quick: string[]; placeholder: string }> = {
  liturgy: { column: "liturgy", ask: PLACE_TEXT.askLiturgy, quick: ["Ամեն կիրակի"], placeholder: "Օրը և ժամը…" },
  services: { column: "services", ask: PLACE_TEXT.askServices, quick: [], placeholder: "Օրերը և ժամերը…" },
  hours: { column: "open_hours", ask: PLACE_TEXT.askHours, quick: ["Ամեն օր 09:00–18:00", "Միշտ բաց է"], placeholder: "Օրերը և ժամերը…" },
  history: { column: "notes", ask: PLACE_TEXT.askHistory, quick: [], placeholder: "Ինչ գիտեք այս տեղի մասին…" },
};
const isTextStep = (step: Step): step is TextStep => step in TEXTS;

const FIELD_LABELS: Array<[Step, string]> = [
  ["name", "Անունը"], ["kind", "Տեսակը"], ["location", "Տեղը"], ["region", "Մարզը"], ["photos", "Լուսանկարները"], ["active", "Գործո՞ղ է"],
  ["liturgy", "Սուրբ Պատարագ"], ["services", "Ժամերգություններ"], ["clergy", "Ծառայողներ"], ["hours", "Բաց ժամերը"],
  ["access", "Ճանապարհը"], ["entrance", "Մուտքը"], ["history", "Պատմությունը"], ["credit", "Իմ անունը"],
];


/** Whether a question is asked for this place: the working-church ones only where they make sense. */
function applies(step: Step, row: Submission): boolean {
  if (step === "active") return ["church", "monastery", "complex"].includes(row.kind);
  if (step === "liturgy" || step === "services" || step === "clergy") return applies("active", row) && row.active === "yes";
  // A place under renovation is closed to visitors; the region is asked only when the map didn't find it.
  if (step === "hours") return !(applies("active", row) && row.active === "renovation");
  if (step === "region") return !row.region;
  return true;
}

const cancelRow = [{ text: PLACE_TEXT.cancel }];
const replyKeyboard = (rows: string[][], placeholder?: string) => ({
  keyboard: [...rows.map((row) => row.map((text) => ({ text }))), cancelRow],
  resize_keyboard: true, is_persistent: true, ...(placeholder ? { input_field_placeholder: placeholder } : {}),
});
const noKeyboard = { remove_keyboard: true };
const isUnknown = (text: string) => text.toLocaleLowerCase("hy") === PLACE_TEXT.unknown.toLocaleLowerCase("hy");

function list(json: string): string[] {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function senderName(reader: Reader) {
  return readerName(reader) || reader.username || "";
}

async function readDraft(db: D1Database, reader: number): Promise<Draft | null> {
  const row = await db.prepare("SELECT step, mode, pending, submission_id, updated_at, finished FROM bot_place_drafts WHERE telegram_id = ?")
    .bind(reader).first<{ step: string; mode: Mode; pending: string | null; submission_id: number | null; updated_at: number; finished: number }>();
  if (!row || row.finished || !row.submission_id || !ORDER.includes(row.step as Step) || Date.now() - row.updated_at > DRAFT_TTL_MS) return null;
  return { step: row.step as Step, mode: row.mode, submission: row.submission_id, pending: row.pending };
}

function writeDraft(db: D1Database, reader: number, draft: Draft) {
  return db.prepare(
    `INSERT INTO bot_place_drafts (telegram_id, header_message_id, finished, updated_at, submission_id, step, mode, pending) VALUES (?, NULL, 0, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET finished = 0, updated_at = excluded.updated_at, submission_id = excluded.submission_id,
       step = excluded.step, mode = excluded.mode, pending = excluded.pending`,
  ).bind(reader, Date.now(), draft.submission, draft.step, draft.mode, draft.pending).run();
}

export async function readSubmission(db: D1Database, id: number) {
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
  let url = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple(?:\.com)?\/p|yandex\.(?:ru|com|am)\/maps\/-)\/[^\s]+/u.exec(text)?.[0];
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

/**
 * «Արմավիրի մարզ, Վաղարշապատ» for a point, from OpenStreetMap's Nominatim (one request per place sent,
 * well within its policy); empty when it can't be found, and the reader is asked instead.
 */
export async function regionFor(point: Point, fetcher: typeof fetch = fetch) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=hy&lat=${point.latitude}&lon=${point.longitude}`;
  const answer = await fetcher(url, { headers: { "user-agent": "apostolic.am places map (info@apostolic.am)" } })
    .then((response) => (response.ok ? response.json() as Promise<{ address?: Record<string, string> }> : null)).catch(() => null);
  const address = answer?.address ?? {};
  const province = address.state ?? address.province ?? "";
  const settlement = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.suburb ?? "";
  // Yerevan is both: «Երևան», not «Երևան, Երևան».
  return [...new Set([province, settlement].filter(Boolean))].join(", ").slice(0, 120);
}

function clergyKeyboard(any: boolean, editing: boolean) {
  const roles: string[] = [...PLACE_CHOICES.clergy];
  // Two ranks a row, «Այլ ծառայող» on its own.
  const rows = Array.from({ length: Math.ceil((roles.length - 1) / 2) }, (_, index) => roles.slice(index * 2, Math.min(index * 2 + 2, roles.length - 1)));
  return replyKeyboard([...rows, [OTHER_ROLE], [any ? PLACE_TEXT.done : PLACE_TEXT.unknown], ...(editing && !any ? [[PLACE_TEXT.back]] : [])]);
}

/** Asks the question of a step, with the buttons that step takes. */
async function ask(call: Call, db: D1Database, chat: number, reader: Reader, draft: Draft, prefix?: string) {
  const row = await readSubmission(db, draft.submission);
  if (!row) return;
  // Questions are numbered among those this place gets (a chapel isn't asked about the Liturgy).
  const number = draft.mode === null ? ORDER.filter((step) => step !== "credit" && step !== "review" && applies(step, row)).indexOf(draft.step) + 1 : 0;
  const say = (text: string, reply_markup: unknown) => call("sendMessage", {
    chat_id: chat, text: [prefix, number ? `${number} · ${text}` : text].filter(Boolean).join("\n\n"), reply_markup,
  });
  const editing = draft.mode !== null;
  // Changing one answer from the review: «Հետ» returns to it unchanged instead of skipping on.
  const back = editing ? [[PLACE_TEXT.back]] : [];
  switch (draft.step) {
    case "name": return say(PLACE_TEXT.askName, replyKeyboard(back, "Անունը…"));
    case "kind": {
      const [church, monastery, chapel, complex, shrine] = PLACE_CHOICES.kind.map(([label]) => label);
      return say(PLACE_TEXT.askKind, replyKeyboard([[church, monastery], [chapel, complex], [shrine, PLACE_TEXT.unknown], ...back], "Կամ գրեք ձեր բառերով…"));
    }
    case "location": return say(PLACE_TEXT.askLocation, {
      keyboard: [[{ text: PLACE_TEXT.shareLocation, request_location: true }], ...back.map((line) => line.map((text) => ({ text }))), cancelRow],
      resize_keyboard: true, is_persistent: true,
    });
    case "region": return say(PLACE_TEXT.askRegion, replyKeyboard(editing ? back : [[PLACE_TEXT.unknown]], "Մարզը, բնակավայրը…"));
    case "photos": return editing
      ? say(PLACE_TEXT.editPhotos, replyKeyboard([[PLACE_TEXT.ready], [PLACE_TEXT.clearPhotos]]))
      : say(PLACE_TEXT.askPhotos, replyKeyboard([[PLACE_TEXT.next], [PLACE_TEXT.noPhotos]]));
    case "active": {
      const [yes, no, renovation] = PLACE_CHOICES.active.map(([label]) => label);
      return say(PLACE_TEXT.askActive, replyKeyboard([[yes], [no, renovation], [PLACE_TEXT.unknown], ...back]));
    }
    case "clergy": {
      if (draft.pending) {
        return say(draft.pending === OTHER_ROLE ? PLACE_TEXT.askClergyOther : `${draft.pending}. ${clergyExample(draft.pending) || PLACE_TEXT.askClergyName}`, replyKeyboard([], "Անունը…"));
      }
      return say(row.clergy ? PLACE_TEXT.askClergyMore : PLACE_TEXT.askClergy, clergyKeyboard(Boolean(row.clergy), editing));
    }
    case "access": return say(PLACE_TEXT.askAccess, replyKeyboard([...PLACE_CHOICES.access.map(([label]) => [label]), [PLACE_TEXT.unknown], ...back], "Կամ նկարագրեք…"));
    case "entrance": {
      const [level, ramp, few, many] = PLACE_CHOICES.entrance.map(([label]) => label);
      return say(PLACE_TEXT.askEntrance, replyKeyboard([[level], [ramp], [few, many], [PLACE_TEXT.unknown], ...back], "Կամ նկարագրեք…"));
    }
    case "credit": {
      const name = senderName(reader);
      return say(PLACE_TEXT.askCredit, replyKeyboard([...(name ? [[`Այո՝ «${name}»`]] : []), [PLACE_TEXT.anonymous], ...back], "Կամ գրեք անունը…"));
    }
    case "review": return showReview(call, chat, row);
    default: {
      // Services: first whether there are any, then (if so) when.
      if (draft.step === "services" && !editing && !draft.pending) {
        return say(PLACE_TEXT.askServicesHeld, replyKeyboard([[PLACE_TEXT.yes, PLACE_TEXT.no], [PLACE_TEXT.unknown]]));
      }
      const question = TEXTS[draft.step];
      const finish = draft.step === "history" ? PLACE_TEXT.skip : PLACE_TEXT.unknown;
      return say(question.ask, replyKeyboard(editing ? back : [...question.quick.map((answer) => [answer]), [finish]], question.placeholder));
    }
  }
}

/** Moves to the next question that applies, or back to the review when an answer was being changed. */
async function advance(call: Call, db: D1Database, chat: number, reader: Reader, draft: Draft, prefix?: string) {
  let step: Step = "review";
  if (draft.mode === null && draft.step !== "review") {
    const row = await readSubmission(db, draft.submission);
    if (!row) return;
    step = ORDER.slice(ORDER.indexOf(draft.step) + 1).find((candidate) => applies(candidate, row)) ?? "review";
  }
  const next: Draft = { ...draft, step, mode: step === "review" ? null : draft.mode, pending: null };
  await writeDraft(db, reader.id, next);
  if (step === "review") await call("sendMessage", { chat_id: chat, text: prefix ?? PLACE_TEXT.reviewIntro, reply_markup: noKeyboard });
  await ask(call, db, chat, reader, next, step === "review" ? undefined : prefix);
}

const short = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

/** The whole submission as text: for the reader's review and for the team. */
function describeSubmission(row: Submission, limit = 700, forTeam = false) {
  const photos = list(row.photos_json).length;
  const videos = list(row.videos_json).length;
  const value = (text: string) => (text ? short(text, limit) : "—");
  if (forTeam) return teamSummary(row, limit);
  const lines = [
    `📍 «${row.place_name}»`,
    `🏛 Տեսակը՝ ${isPlaceKind(row.kind) ? PLACE_KINDS[row.kind] : row.kind_note || "—"}`,
    row.latitude === null || row.longitude === null ? "🗺 Տեղը՝ նշված չէ" : forTeam ? `🗺 Տեղը՝ ${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}` : "🗺 Տեղը՝ նշված է ✓",
    `🏞 Մարզը՝ ${row.region || "—"}`,
    `📷 Լուսանկարներ՝ ${photos}${videos ? `, տեսանյութ՝ ${videos}` : ""}`,
    applies("active", row) ? `✝️ Կարգավիճակը՝ ${ACTIVE_LABELS[row.active] ?? "—"}` : "",
    applies("liturgy", row) ? `🕊 Սուրբ Պատարագ՝ ${value(row.liturgy)}` : "",
    applies("services", row) ? `🕯 Ժամերգություններ՝ ${value(row.services)}` : "",
    applies("clergy", row) ? `🙏 Ծառայողներ՝${row.clergy ? `\n${short(row.clergy, limit)}` : " —"}` : "",
    applies("hours", row) ? `🕘 Բաց է՝ ${value(row.open_hours)}` : "",
    `♿ Ճանապարհը և մուտքը՝${row.accessibility ? `\n${row.accessibility}` : " —"}`,
    `📜 Պատմությունը՝ ${value(row.notes)}`,
    `👤 Անունը կայքում՝ ${row.credit && row.credit_name ? `«${row.credit_name}»` : "չի նշվի (անանուն)"}`,
  ];
  return lines.filter(Boolean).join("\n\n");
}

const reviewButtons = {
  inline_keyboard: [
    [{ text: "✅ Ուղարկել", callback_data: "place:send" }],
    [{ text: "✏️ Փոխել կամ լրացնել", callback_data: "place:edit" }],
    [{ text: "✖️ Չեղարկել", callback_data: "place:cancel" }],
  ],
};

function showReview(call: Call, chat: number, row: Submission) {
  return call("sendMessage", { chat_id: chat, text: `${PLACE_TEXT.reviewTitle}\n\n${describeSubmission(row)}`, reply_markup: reviewButtons });
}

/** /place: starts again from the first question. */
export async function startPlace(call: Call, db: D1Database, chat: number, reader: Reader | number) {
  const from = typeof reader === "number" ? { id: reader } : reader;
  await discard(db, from.id, await readDraft(db, from.id));
  const created = await db.prepare("INSERT INTO place_submissions (telegram_id, sender_name) VALUES (?, ?) RETURNING id")
    .bind(from.id, senderName(from) || "Անանուն").first<{ id: number }>();
  if (!created) return;
  const draft: Draft = { step: "name", mode: null, submission: created.id, pending: null };
  await writeDraft(db, from.id, draft);
  await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.start });
  await ask(call, db, chat, from, draft);
}

const BUTTONS = new Set<string>([
  PLACE_TEXT.cancel, PLACE_TEXT.next, PLACE_TEXT.done, PLACE_TEXT.skip, PLACE_TEXT.unknown, PLACE_TEXT.noPhotos, PLACE_TEXT.ready,
  PLACE_TEXT.clearPhotos, PLACE_TEXT.anonymous, PLACE_TEXT.shareLocation, PLACE_TEXT.back, ...PLACE_TEXT.legacy,
  ...PLACE_CHOICES.kind.map(([label]) => label), ...PLACE_CHOICES.active.map(([label]) => label), ...PLACE_CHOICES.access.map(([label]) => label), ...PLACE_CHOICES.entrance.map(([label]) => label),
  ...PLACE_CHOICES.clergy, ...Object.values(TEXTS).flatMap((question) => question.quick),
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
  const again = (reply: string) => call("sendMessage", { chat_id: chat, text: reply }).then(() => true);
  const next = (prefix?: string) => advance(call, db, chat, reader, draft, prefix).then(() => true);

  switch (draft.step) {
    case "name": {
      if (isUnknown(text)) return again(PLACE_TEXT.nameUnknown);
      if (!text || BUTTONS.has(text)) return ask(call, db, chat, reader, draft).then(() => true);
      await update("place_name = ?", text.slice(0, 120));
      return next();
    }
    case "kind": {
      // A button, «Չգիտեմ», or the reader's own words («Հեթանոսական տաճար») for the team to sort out.
      const kind = PLACE_CHOICES.kind.find(([label]) => label === text)?.[1];
      if (!kind && !text) return again(PLACE_TEXT.kindHelp);
      const note = kind || isUnknown(text) ? "" : text.slice(0, 120);
      await update("kind = ?, kind_note = ?", kind ?? "", note);
      return next();
    }
    case "location": {
      let point = message.location ?? (text ? await pointFromText(text, fetcher) : null);
      if (!point) return again(PLACE_TEXT.locationHelp);
      // Coordinates typed the other way round («44.29, 40.16»).
      if (!insideArmenia(point.latitude, point.longitude) && insideArmenia(point.longitude, point.latitude)) point = { latitude: point.longitude, longitude: point.latitude };
      if (!insideArmenia(point.latitude, point.longitude)) return again(PLACE_TEXT.outside);
      const region = await regionFor(point, fetcher);
      await update("latitude = ?, longitude = ?, region = CASE WHEN ? = '' THEN region ELSE ? END", point.latitude, point.longitude, region, region);
      return next(region ? `${PLACE_TEXT.locationDone} ${region}` : PLACE_TEXT.locationDone);
    }
    case "region": {
      if (isUnknown(text)) return next();
      const words = text.slice(0, 120);
      if (!words || BUTTONS.has(words)) return again(PLACE_TEXT.textHelp);
      await update("region = ?", words);
      return next();
    }
    case "photos": {
      if (text === PLACE_TEXT.next || text === PLACE_TEXT.noPhotos || text === PLACE_TEXT.ready) return next();
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
    case "active": {
      const active = isUnknown(text) ? "" : PLACE_CHOICES.active.find(([label]) => label === text)?.[1];
      if (active === undefined) return again(PLACE_TEXT.kindHelp);
      await update("active = ?", active);
      return next();
    }
    case "clergy": {
      if (!draft.pending && (text === PLACE_TEXT.done || isUnknown(text))) return next();
      // A role, also instead of the one picked before: its person's name comes next.
      if ((PLACE_CHOICES.clergy as readonly string[]).includes(text)) {
        const picked: Draft = { ...draft, pending: text };
        await writeDraft(db, reader.id, picked);
        await ask(call, db, chat, reader, picked);
        return true;
      }
      const words = (message.text ?? "").trim();
      if (!words || BUTTONS.has(words)) return again(PLACE_TEXT.clergyHelp);
      const row = await readSubmission(db, draft.submission);
      const clergy = addServant(row?.clergy ?? "", draft.pending, words.slice(0, 160));
      await update("clergy = ?", clergy.slice(0, MAX_TEXT));
      const added: Draft = { ...draft, pending: null };
      await writeDraft(db, reader.id, added);
      await ask(call, db, chat, reader, added, `✅ Ավելացվեց։\n\n${clergy}`);
      return true;
    }
    case "access":
    case "entrance": {
      if (isUnknown(text)) return next();
      const words = (message.text ?? "").trim();
      if (!words) return again(PLACE_TEXT.textHelp);
      const row = await readSubmission(db, draft.submission);
      await update("accessibility = ?", setAccessPart(row?.accessibility ?? "", draft.step === "access" ? ROAD : ENTRANCE, words.slice(0, 300)));
      return next();
    }
    case "credit": {
      const words = text.slice(0, 60);
      if (!words) return ask(call, db, chat, reader, draft).then(() => true);
      const named = words !== PLACE_TEXT.anonymous;
      const name = /^Այո՝ «(.+)»$/u.exec(words)?.[1] ?? words;
      await update("credit = ?, credit_name = ?", named ? 1 : 0, named ? name : "");
      return next(PLACE_TEXT.reviewIntro);
    }
    case "review": {
      // The review waits for its buttons; anything typed shows it again.
      const row = await readSubmission(db, draft.submission);
      if (row) await showReview(call, chat, row);
      return true;
    }
    default: {
      const question = TEXTS[draft.step];
      const column = question.column;
      if (text === PLACE_TEXT.skip || text === PLACE_TEXT.next || isUnknown(text)) return next();
      if (draft.step === "services" && !draft.mode && !draft.pending) {
        if (text === PLACE_TEXT.no) {
          await update("services = ?", PLACE_TEXT.noServices);
          return next();
        }
        if (text === PLACE_TEXT.yes) {
          const when: Draft = { ...draft, pending: "when" };
          await writeDraft(db, reader.id, when);
          await ask(call, db, chat, reader, when);
          return true;
        }
      }
      // A ready answer («Ամեն կիրակի») is the whole answer.
      if (question.quick.includes(text)) {
        await update(`${column} = ?`, text);
        return next();
      }
      const words = (message.text ?? message.caption ?? "").trim();
      if (!words || BUTTONS.has(words)) return again(PLACE_TEXT.textHelp);
      if (draft.mode === "replace") await update(`${column} = substr(?, 1, ${MAX_TEXT})`, words);
      else await update(`${column} = substr(CASE WHEN ${column} = '' THEN ? ELSE ${column} || char(10) || ? END, 1, ${MAX_TEXT})`, words, words);
      // One message answers the question (more can be added from the review).
      return next(draft.mode ? "✍️ Պահպանված է։" : undefined);
    }
  }
}

/** Posts a sent submission in the team's places topic: the details, the pin, then the pictures. */
/** The team's copy: only what was answered, one line each, the place as a map link. */
export function teamSummary(row: Submission, limit: number) {
  const field = (label: string, text: string) => (text ? `${label}՝ ${short(text, limit)}` : "");
  return [
    `📍 «${row.place_name}»`,
    field("🏛 Տեսակը", isPlaceKind(row.kind) ? PLACE_KINDS[row.kind] : row.kind_note),
    field("🏞 Մարզը", row.region),
    row.latitude !== null && row.longitude !== null ? `🗺 https://maps.google.com/?q=${row.latitude.toFixed(5)},${row.longitude.toFixed(5)}` : "",
    applies("active", row) ? field("✝️ Կարգավիճակը", ACTIVE_LABELS[row.active] ?? "") : "",
    applies("liturgy", row) ? field("🕊 Սուրբ Պատարագ", row.liturgy) : "",
    applies("services", row) ? field("🕯 Ժամերգություններ", row.services) : "",
    applies("clergy", row) && row.clergy ? `🙏 Ծառայողներ՝\n${short(row.clergy, limit)}` : "",
    applies("hours", row) ? field("🕘 Բաց է", row.open_hours) : "",
    row.accessibility ? `♿ ${row.accessibility.replace(/\n/gu, "\n♿ ")}` : "",
    field("📜 Պատմությունը", row.notes),
    `👤 Կայքում՝ ${row.credit && row.credit_name ? `«${row.credit_name}»` : "անանուն"}`,
  ].filter(Boolean).join("\n");
}

// A photo's caption may hold 1024 characters.
const CAPTION_LIMIT = 1024;

/**
 * Posts a sent submission in the team's places topic as one message: the photos as an album whose
 * caption is the summary (or the summary alone when there are none). An admin's reply to it reaches
 * the sender (#u… in the text).
 */
async function deliver(call: Call, target: Target, row: Submission, from: Reader) {
  const hint = "↩️ Պատասխանելու համար՝ Reply արեք այս հաղորդագրությանը։";
  const full = `${relayHeader("📍 Սրբավայր", from)}\n\n${teamSummary(row, 400)}\n\n${hint}`;
  const media = [...list(row.photos_json).map((media) => ({ type: "photo", media })), ...list(row.videos_json).map((media) => ({ type: "video", media }))].slice(0, MAX_PICTURES);
  const caption = full.length <= CAPTION_LIMIT ? full
    : `${relayHeader("📍 Սրբավայր", from)}\n\n${short(teamSummary(row, 120), CAPTION_LIMIT - hint.length - 40)}\n\nԱմբողջը՝ /admin/places\n${hint}`;
  const send = (to: Target) => media.length === 0 ? call("sendMessage", { ...to, text: short(full, 4096), link_preview_options: { is_disabled: true } })
    : media.length === 1 ? call(media[0].type === "photo" ? "sendPhoto" : "sendVideo", { ...to, [media[0].type]: media[0].media, caption })
    : call("sendMediaGroup", { ...to, media: media.map((item, index) => (index === 0 ? { ...item, caption } : item)) });
  const posted = await send(target);
  // The places topic may be missing (deleted, or not made yet): then the group's General topic.
  if (!posted.ok && target.message_thread_id) await send({ chat_id: target.chat_id });
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
  const row = await readSubmission(db, draft.submission);
  if (!row) return;

  if (data === "place:cancel") {
    await discard(db, query.from.id, draft);
    await edit("✖️ Չեղարկված է։");
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.cancelled, reply_markup: noKeyboard });
    return;
  }
  if (data === "place:send") {
    if (draft.step !== "review") return;
    await db.prepare("UPDATE place_submissions SET submitted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(row.id).run();
    await db.prepare("DELETE FROM bot_place_drafts WHERE telegram_id = ?").bind(query.from.id).run();
    await edit(`✅ Ուղարկված է\n\n${describeSubmission(row)}`);
    await call("sendMessage", { chat_id: chat, text: PLACE_TEXT.sent, reply_markup: noKeyboard });
    await deliver(call, target, row, query.from);
    return;
  }
  if (data === "place:edit") {
    const fields = FIELD_LABELS.filter(([step]) => step === "region" || applies(step, row));
    const rows = [];
    for (let index = 0; index < fields.length; index += 2) {
      rows.push(fields.slice(index, index + 2).map(([step, label]) => ({ text: label, callback_data: `place:field:${step}` })));
    }
    await edit(PLACE_TEXT.chooseField, { inline_keyboard: [...rows, [{ text: "← Հետ", callback_data: "place:back" }]] });
    return;
  }
  if (data === "place:back") {
    await writeDraft(db, query.from.id, { ...draft, step: "review", mode: null, pending: null });
    await edit(`${PLACE_TEXT.reviewTitle}\n\n${describeSubmission(row)}`, reviewButtons);
    return;
  }
  const field = /^place:field:([a-z]+)$/u.exec(data)?.[1] as Step | undefined;
  if (field && FIELD_LABELS.some(([step]) => step === field) && (field === "region" || applies(field, row))) {
    await edit(`✏️ ${FIELD_LABELS.find(([step]) => step === field)?.[1]}`);
    const current = isTextStep(field) ? String(row[TEXTS[field].column] ?? "") : field === "clergy" ? row.clergy : "";
    if ((isTextStep(field) || field === "clergy") && current) {
      // Something is written already: add to it, write it anew, or clear it.
      await writeDraft(db, query.from.id, { ...draft, step: field, mode: "edit", pending: null });
      await call("sendMessage", {
        chat_id: chat, text: `${PLACE_TEXT.editText}\n\n${short(current, 3500)}`,
        reply_markup: { inline_keyboard: [
          [{ text: "➕ Ավելացնել", callback_data: "place:text:append" }, { text: "✏️ Գրել նորից", callback_data: "place:text:replace" }],
          [{ text: "🗑 Ջնջել", callback_data: "place:text:clear" }, { text: "← Հետ", callback_data: "place:back" }],
        ] },
      });
      return;
    }
    const next: Draft = { ...draft, step: field, mode: isTextStep(field) ? "append" : "edit", pending: null };
    await writeDraft(db, query.from.id, next);
    await ask(call, db, chat, query.from, next);
    return;
  }
  const textMode = /^place:text:(append|replace|clear)$/u.exec(data)?.[1];
  if (textMode && (isTextStep(draft.step) || draft.step === "clergy")) {
    const column = draft.step === "clergy" ? "clergy" : TEXTS[draft.step].column;
    if (messageId) await call("editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
    if (textMode === "clear" || (textMode === "replace" && draft.step === "clergy")) {
      await db.prepare(`UPDATE place_submissions SET ${column} = '' WHERE id = ?`).bind(draft.submission).run();
    }
    if (textMode === "clear") {
      await advance(call, db, chat, query.from, { ...draft, mode: "edit" }, "🗑 Ջնջված է։");
      return;
    }
    if (draft.step === "clergy") {
      // The people serving are added by role again, until «Վերջ».
      const next: Draft = { ...draft, mode: "edit", pending: null };
      await writeDraft(db, query.from.id, next);
      await ask(call, db, chat, query.from, next);
      return;
    }
    const next: Draft = { ...draft, mode: textMode as Mode };
    await writeDraft(db, query.from.id, next);
    await call("sendMessage", { chat_id: chat, text: textMode === "append" ? PLACE_TEXT.writeAppend : PLACE_TEXT.writeReplace, reply_markup: replyKeyboard([[PLACE_TEXT.back]]) });
  }
}
