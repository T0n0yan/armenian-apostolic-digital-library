/**
 * The support relay without state: the bot writes the reader's Telegram id into the message it
 * posts in the private support group (#u123), and an admin's reply to that message goes back to
 * the reader. Which topic a message belongs to comes from the bot's prompt the reader answered.
 */
export type SupportKind = "support" | "contact";

export const SUPPORT_PROMPTS: Record<SupportKind, string> = {
  support: "🛠 Գրեք խնդիրը մեկ հաղորդագրությամբ. կարող եք կցել նկար կամ էկրանի պատկեր։",
  contact: "✉️ Գրեք ձեր հարցը կամ առաջարկը մեկ հաղորդագրությամբ։",
};

const LABELS: Record<SupportKind, string> = { support: "🛠 Տեխնիկական", contact: "✉️ Հարց կամ առաջարկ" };

/** The kind of the bot's prompt the reader replied to; plain messages count as questions. */
export function supportKindFor(repliedText: string | undefined): SupportKind {
  return repliedText === SUPPORT_PROMPTS.support ? "support" : "contact";
}

type Reader = { id: number; first_name?: string; last_name?: string; username?: string };

/** The line the team sees above a reader's message: what it is, who sent it, and their id. */
export function relayHeader(label: string, user: Reader) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Անանուն";
  return `${label} · ${name}${user.username ? ` @${user.username}` : ""} · #u${user.id}`;
}

export function supportHeader(kind: SupportKind, user: Reader) {
  return relayHeader(LABELS[kind], user);
}

/** The /place conversation: what the reader is asked and the buttons that end it. */
export const PLACE_TEXT = {
  start: [
    "📍 Ուղարկեք սրբավայր",
    "",
    "Այս չաթում ուղարկեք՝",
    "1. Մի քանի նկար (լավ կլինի, որ ամբողջ եկեղեցին երևա)",
    "2. Տեղադրությունը՝ 📎 → Location",
    "3. Անունը և այն, ինչ գիտեք դրա մասին",
    "4. Տեսանյութ, եթե ունեք",
    "",
    "Ուղարկածը տեսնում է միայն մեր թիմը։ Վերջում սեղմեք «✅ Ավարտել»։",
  ].join("\n"),
  received: "Ստացանք ✅ Շարունակեք ուղարկել կամ սեղմեք «✅ Ավարտել»։",
  empty: "Դեռ ոչինչ չեք ուղարկել. ուղարկեք նկարները կամ սեղմեք «✖️ Չեղարկել»։",
  done: "Ստացանք ձեր ուղարկածը ✅ Շնորհակալություն 🙏",
  askName: "Եթե տեղն ավելացնենք քարտեզում, նշե՞նք ձեր անունը որպես ուղարկող։",
  named: "Լավ, կնշենք ձեր անունը։",
  anonymous: "Լավ, կմնաք անանուն։",
  cancelled: "Չեղարկվեց։ Կարող եք նորից սկսել /place հրամանով։",
  finish: "✅ Ավարտել",
  cancel: "✖️ Չեղարկել",
};

/** The reader's Telegram id from a relayed message, or null when it isn't one. */
export function readerIdFrom(text: string | undefined) {
  const match = /#u(\d{1,20})\b/u.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/** Joins the header and the reader's text, cut to Telegram's limit. */
export function relayedText(header: string, body: string, limit: number) {
  const text = body ? `${header}\n\n${body}` : header;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
