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
    "📍 Ավելացնենք եկեղեցի, վանք կամ սրբավայր քարտեզում",
    "",
    "Կտանք մի քանի կարճ հարց։ Եթե որևէ հարցի պատասխանը չգիտեք, կարող եք բաց թողնել։ Վերջում կտեսնեք ամբողջ ուղարկածը, կկարողանաք փոխել կամ լրացնել, և միայն դրանից հետո այն կհասնի մեր թիմին։",
    "",
    "✍️ Խնդրում ենք պատասխանները գրել հայատառ։",
  ].join("\n"),
  askName: "1/7 · Ինչպե՞ս է կոչվում։\nՕրինակ՝ Սուրբ Գայանե վանք, Վաղարշապատ",
  askLocation: [
    "2/7 · Որտե՞ղ է գտնվում։",
    "",
    "📍 Եթե հիմա այնտեղ եք, սեղմեք ներքևի «Ուղարկել իմ գտնվելու վայրը» կոճակը։",
    "",
    "🗺 Եթե այնտեղ չեք՝ սեղմեք 📎 (կցել) → «Location» → տեղաշարժեք քարտեզը, որ նշիչը լինի եկեղեցու վրա → «Send selected location»։",
    "",
    "🔗 Կարող եք նաև ուղարկել Google Maps-ի հղումը։",
  ].join("\n"),
  locationHelp: "Չհաջողվեց գտնել տեղը 🙏 Սեղմեք «📍 Ուղարկել իմ գտնվելու վայրը», կամ 📎 → «Location», կամ ուղարկեք Google Maps-ի հղումը։",
  outside: "Այս կետը Հայաստանից դուրս է։ Քարտեզում առայժմ միայն Հայաստանի սրբավայրերն են. ստուգեք նշիչը և ուղարկեք նորից։",
  locationDone: "✅ Տեղը նշված է։",
  askPhotos: "3/7 · Ուղարկեք լուսանկարներ (մինչև 10)։ Լավ կլինի, որ գոնե մեկում ամբողջ շենքը երևա։ Կարող եք կցել նաև տեսանյութ։\n\nԵրբ ավարտեք, սեղմեք «➡️ Հաջորդը»։",
  photoReceived: "📷 Լուսանկարը ստացանք։ Եթե ունեք նաև այլ լուսանկարներ, կարող եք ուղարկել դրանք, կամ սեղմեք «➡️ Հաջորդը»։",
  photosHelp: "Այս քայլում սպասում ենք լուսանկարների կամ տեսանյութի։ Եթե ուղարկելու բան չունեք, սեղմեք «⏭ Առանց լուսանկարի»։",
  tooMany: "Ստացանք 10 լուսանկար, դա լիովին բավական է 🙏 Սեղմեք «➡️ Հաջորդը»։",
  askHistory: "4/7 · Ի՞նչ գիտեք այս տեղի մասին՝ ե՞րբ է կառուցվել, ո՞ւմ անունով է, ի՞նչ պատմություն ունի։",
  askClergy: "5/7 · Ո՞վ է ծառայում այստեղ։\nՕրինակ՝ Տեր Հովհաննես քահանա Աբրահամյան",
  askServices: "6/7 · Ե՞րբ են ժամերգությունները և Սուրբ Պատարագը, և ե՞րբ է եկեղեցին բաց։\nՕրինակ՝ Երկուշաբթիից շաբաթ՝ 09:30–10:00 և 17:00–17:30, կիրակի՝ Սուրբ Պատարագ 11:00",
  askAccess: "7/7 · Հարմա՞ր է արդյոք մուտքը սայլակով կամ քայլելու դժվարություն ունեցող մարդկանց համար։\nԸնտրեք ներքևից կամ գրեք մանրամասն։",
  textAdded: "✍️ Գրանցեցինք։ Եթե մտքին այլ բան գա, կարող եք գրել ևս մեկ հաղորդագրությամբ, կամ սեղմեք «➡️ Հաջորդը»։",
  textHelp: "Գրեք պատասխանը տեքստով կամ սեղմեք «⏭ Բաց թողնել»։",
  armenianOnly: "Խնդրում ենք գրել հայատառ 🙏 Օրինակ՝ «Սուրբ Գայանե», ոչ թե «Surb Gayane»։",
  askCredit: "Եթե տեղն ավելացնենք քարտեզում, նշե՞նք ձեր անունը որպես տեղեկությունը տրամադրողի։\nԿարող եք նաև գրել այն անունը, որով կուզեիք նշվել։",
  reviewIntro: "Գրեթե պատրաստ է 👇 Ստուգեք ամեն ինչ։",
  reviewTitle: "Ահա ձեր ուղարկածը։ Եթե ամեն ինչ ճիշտ է, սեղմեք «✅ Ուղարկել»։ Փոխելու կամ լրացնելու համար՝ «✏️ Փոխել»։",
  chooseField: "Ի՞նչն եք ուզում փոխել կամ լրացնել։",
  editText: "Ահա, թե ինչ եք գրել։ Ի՞նչ անենք։",
  writeAppend: "Գրեք, թե ինչ ավելացնել։",
  writeReplace: "Գրեք նոր տարբերակը. այն կփոխարինի նախորդին։",
  editPhotos: "Ուղարկեք լրացուցիչ լուսանկարներ, կամ ջնջեք եղածները և ուղարկեք նորից։ Երբ ավարտեք, սեղմեք «✔️ Պատրաստ է»։",
  sent: "Շնորհակալություն 🙏 Ստացանք ձեր ուղարկածը։\nՄեր թիմը կստուգի տեղեկությունը և կավելացնի քարտեզում։ Եթե հարց լինի, կգրենք այստեղ։",
  cancelled: "Չեղարկվեց, ոչինչ չի ուղարկվել։ Կարող եք նորից սկսել /place հրամանով։",
  stale: "Այս ուղարկումն արդեն ավարտված է կամ չեղարկված։ Նորից սկսելու համար՝ /place",
  shareLocation: "📍 Ուղարկել իմ գտնվելու վայրը",
  next: "➡️ Հաջորդը",
  skip: "⏭ Բաց թողնել",
  noPhotos: "⏭ Առանց լուսանկարի",
  ready: "✔️ Պատրաստ է",
  clearPhotos: "🗑 Ջնջել լուսանկարները",
  anonymous: "Ոչ, թող անանուն մնա",
  cancel: "✖️ Չեղարկել",
  back: "↩️ Հետ՝ առանց փոփոխության",
  /** Buttons of the first version of /place, still on some readers' keyboards. */
  legacy: ["✅ Ավարտել", "➡️ Շարունակել", "📍 Ուղարկել իմ տեղը"],
};

/** «Հարմա՞ր է մուտքը սայլակով…» answers, as the buttons show them. */
export const ACCESS_OPTIONS = ["♿ Այո, հարմար է", "Մասամբ (կան աստիճաններ)", "Ոչ, հարմար չէ", "Չգիտեմ"];

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
