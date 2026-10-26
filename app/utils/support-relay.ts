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
    "Կտանք մի քանի կարճ հարց։ Եթե որևէ հարցի պատասխանը չգիտեք, սեղմեք «Չգիտեմ»։ Վերջում կտեսնեք ամբողջ ուղարկածը, կկարողանաք փոխել կամ լրացնել, և միայն դրանից հետո այն կհասնի մեր թիմին։",
    "",
    "✍️ Խնդրում ենք պատասխանները գրել հայատառ։",
  ].join("\n"),
  askName: "Ինչպե՞ս է կոչվում։\nՕրինակ՝ Սուրբ Գրիգոր Նարեկացի եկեղեցի",
  askKind: "Ի՞նչ է սա։\n\nՀամալիր՝ մի քանի շինությունից բաղկացած տարածք, օրինակ՝ Մայր Աթոռ, Զվարթնոց։",
  kindHelp: "Ընտրեք ներքևի կոճակներից մեկը։",
  askLocation: [
    "Որտե՞ղ է գտնվում։",
    "",
    "📍 Եթե հիմա այնտեղ եք, սեղմեք ներքևի «Ուղարկել իմ գտնվելու վայրը» կոճակը։",
    "",
    "🗺 Եթե այնտեղ չեք՝ սեղմեք 📎 (կցել) → «Location» → տեղաշարժեք քարտեզը, որ նշիչը (📍) լինի եկեղեցու վրա → «Send selected location»։",
    "",
    "🔗 Կարող եք նաև ուղարկել Google Maps-ի հղումը։",
  ].join("\n"),
  locationHelp: "Չհաջողվեց գտնել տեղը 🙏 Սեղմեք «📍 Ուղարկել իմ գտնվելու վայրը», կամ 📎 → «Location», կամ ուղարկեք Google Maps-ի հղումը։",
  outside: "Այս կետը Հայաստանից դուրս է։ Քարտեզում առայժմ միայն Հայաստանի սրբավայրերն են. ստուգեք նշիչը և ուղարկեք նորից։",
  locationDone: "✅ Տեղը նշված է։",
  askPhotos: "Ուղարկեք լուսանկարներ (մինչև 10)։ Լավ կլինի, որ գոնե մեկում ամբողջ շենքը երևա։ Կարող եք կցել նաև տեսանյութ։\n\nԵրբ ավարտեք, սեղմեք «➡️ Հաջորդը»։",
  photoReceived: "📷 Լուսանկարը ստացանք։ Եթե ունեք նաև այլ լուսանկարներ, կարող եք ուղարկել դրանք, կամ սեղմեք «➡️ Հաջորդը»։",
  photosHelp: "Այս քայլում սպասում ենք լուսանկարների կամ տեսանյութի։ Եթե ուղարկելու բան չունեք, սեղմեք «⏭ Առանց լուսանկարի»։",
  tooMany: "Ստացանք 10 լուսանկար, դա լիովին բավական է 🙏 Սեղմեք «➡️ Հաջորդը»։",
  askActive: "Գործո՞ղ եկեղեցի է, այսինքն՝ արարողություններ մատուցվո՞ւմ են այստեղ։",
  askLiturgy: "Ե՞րբ է մատուցվում Սուրբ Պատարագը։\nՕրինակ՝ կիրակի 11:00",
  askServices: "Ե՞րբ են ժամերգությունները։\nՕրինակ՝ երկուշաբթիից շաբաթ 09:30–10:00 և 17:00–17:30",
  askClergy: "Ովքե՞ր են ծառայում այստեղ։\nԸնտրեք դերը, հետո գրեք անունը։ Կարող եք ավելացնել մի քանի մարդու։",
  askClergyMore: "Ավելացնե՞լ ևս մեկին։ Ընտրեք դերը կամ սեղմեք «➡️ Վերջ»։",
  askClergyName: "Գրեք անունը։",
  askClergyOther: "Գրեք դերը և անունը։\nՕրինակ՝ Դպիր՝ Արմեն Սարգսյան",
  clergyHelp: "Նախ ընտրեք դերը ներքևի կոճակներից։",
  askHours: "Ե՞րբ է բաց այցելուների համար։\nՕրինակ՝ ամեն օր 09:00–18:00",
  askAccess: "Ինչպիսի՞ն է ճանապարհն ու մուտքը։\nԸնտրեք ներքևից կամ գրեք ձեր բառերով (օրինակ՝ քարքարոտ արահետ, 200 մ)։",
  askHistory: "Ի՞նչ գիտեք այս տեղի մասին՝ ե՞րբ է կառուցվել, ո՞ւմ անունով է, ի՞նչ պատմություն ունի։",
  textAdded: "✍️ Գրանցեցինք։ Եթե մտքին այլ բան գա, կարող եք գրել ևս մեկ հաղորդագրությամբ, կամ սեղմեք «➡️ Հաջորդը»։",
  textHelp: "Գրեք պատասխանը տեքստով կամ սեղմեք «Չգիտեմ»։",
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
  done: "➡️ Վերջ",
  skip: "⏭ Բաց թողնել",
  unknown: "Չգիտեմ",
  noPhotos: "⏭ Առանց լուսանկարի",
  ready: "✔️ Պատրաստ է",
  clearPhotos: "🗑 Ջնջել լուսանկարները",
  anonymous: "Ոչ, թող անանուն մնա",
  cancel: "✖️ Չեղարկել",
  back: "↩️ Հետ՝ առանց փոփոխության",
  /** Buttons of earlier versions of /place, still on some readers' keyboards. */
  legacy: ["✅ Ավարտել", "➡️ Շարունակել", "📍 Ուղարկել իմ տեղը", "♿ Այո, հարմար է", "Մասամբ (կան աստիճաններ)", "Ոչ, հարմար չէ"],
};

/** /place's choice questions: what each button means, in the order the buttons show. */
export const PLACE_CHOICES = {
  kind: [["⛪ Եկեղեցի", "church"], ["Վանք", "monastery"], ["Մատուռ", "chapel"], ["Համալիր", "complex"], ["Սրբավայր", "shrine"]],
  active: [["Այո, գործող է", "yes"], ["Ոչ, չի գործում", "no"], ["Վերանորոգվում է", "renovation"]],
  access: [["♿ Հարթ է, սայլակով կարելի է"], ["Կան աստիճաններ"], ["Դժվար ճանապարհ (քարքարոտ, լեռնային)"]],
  clergy: ["Թեմի Առաջնորդ", "Վանահայր", "Քահանա", "Սարկավագ", "Այլ ծառայող"],
} as const;

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
