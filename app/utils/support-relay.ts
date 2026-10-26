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
    "📍 Ուղարկեք եկեղեցի, վանք կամ սրբավայր քարտեզի համար",
    "",
    "Կհարցնենք 4 բան՝ անունը, տեղը, նկարները և այն, ինչ գիտեք դրա մասին։ Ուղարկածը տեսնում է միայն մեր թիմը։",
  ].join("\n"),
  askName: "1/4 · Ինչպե՞ս է կոչվում։\nՕրինակ՝ Սուրբ Գայանե, Վաղարշապատ",
  askLocation: [
    "2/4 · Որտե՞ղ է։",
    "",
    "• Եթե հիմա այնտեղ եք՝ սեղմեք ներքևի «📍 Ուղարկել իմ տեղը» կոճակը։",
    "• Եթե այնտեղ չեք՝ սեղմեք 📎 (կցել) → «Location» (Տեղադրություն) → քարտեզը տեղաշարժեք, որ նշանը լինի եկեղեցու վրա → «Send selected location»։",
    "• Կարող եք ուղարկել նաև Google Maps-ի հղումը։",
  ].join("\n"),
  locationHelp: "Տեղը չգտանք 🙏 Սեղմեք «📍 Ուղարկել իմ տեղը» կամ 📎 → «Location», կամ ուղարկեք Google Maps-ի հղումը։",
  outside: "Այս կետը Հայաստանից դուրս է։ Քարտեզը հիմա միայն Հայաստանի համար է. ստուգեք կետը և ուղարկեք նորից։",
  locationDone: "✅ Տեղը ստացանք։",
  askPhotos: "3/4 · Ուղարկեք 1–5 նկար (լավ կլինի, որ ամբողջ եկեղեցին երևա)։ Կարող եք ուղարկել նաև տեսանյութ։\nՎերջում սեղմեք «➡️ Շարունակել»։ Եթե նկար չունեք՝ նույնպես «➡️ Շարունակել»։",
  photoReceived: "📷 Ստացանք։ Ուղարկեք ևս կամ սեղմեք «➡️ Շարունակել»։",
  photosHelp: "Այս քայլում սպասում ենք նկարների. ուղարկեք նկար կամ սեղմեք «➡️ Շարունակել»։",
  tooMany: "Բավական է, շնորհակալություն 🙏 Սեղմեք «➡️ Շարունակել»։",
  askNotes: "4/4 · Գրեք այն, ինչ գիտեք՝ պատմությունը, ով է ծառայում, երբ են ժամերգությունները։\nԵթե ոչինչ չգիտեք՝ սեղմեք «⏭ Բաց թողնել»։",
  notesHelp: "Գրեք տեքստով կամ սեղմեք «⏭ Բաց թողնել»։",
  done: "Ստացանք ձեր ուղարկածը ✅ Շնորհակալություն 🙏\nՄեր թիմը կստուգի և կավելացնի քարտեզում։",
  askCredit: "Եթե տեղն ավելացնենք քարտեզում, նշե՞նք ձեր անունը որպես ուղարկող։",
  named: "Լավ, կնշենք ձեր անունը։",
  anonymous: "Լավ, կմնաք անանուն։",
  cancelled: "Չեղարկվեց։ Կարող եք նորից սկսել /place հրամանով։",
  shareLocation: "📍 Ուղարկել իմ տեղը",
  next: "➡️ Շարունակել",
  skip: "⏭ Բաց թողնել",
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
