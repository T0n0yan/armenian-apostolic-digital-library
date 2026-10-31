/**
 * The support relay without state: the bot writes the reader's Telegram id into the message it
 * posts in the private support group (#u123), and an admin's reply to that message goes back to
 * the reader. Which topic a message belongs to comes from the bot's prompt the reader answered.
 */
import { CLERGY_RANKS } from "./clergy-titles";

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
/** The reader's name as Telegram gives it, without invisible characters (some names are only those). */
export function readerName(user: Reader) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").replace(/[\p{Cf}\p{Cc}]/gu, "").replace(/\s+/gu, " ").trim();
}

export function relayHeader(label: string, user: Reader) {
  const name = readerName(user) || (user.username ? "" : "Անանուն");
  return `${label} · ${[name, user.username ? `@${user.username}` : ""].filter(Boolean).join(" ")} · #u${user.id}`;
}

export function supportHeader(kind: SupportKind, user: Reader) {
  return relayHeader(LABELS[kind], user);
}

/** The /place conversation: what the reader is asked and the buttons that end it. */
export const PLACE_TEXT = {
  start: [
    "📍 Ավելացնենք եկեղեցի, վանք կամ սրբավայր քարտեզում",
    "",
    "Կտանք մի քանի կարճ հարց։ Եթե որևէ հարցի պատասխանը չգիտեք, սեղմեք «Չգիտեմ»։ Ուղարկելուց առաջ կտեսնեք հրապարակման վերջնական տեսքը և կկարողանաք փոխել այն։",
    "",
    "✍️ Ցանկալի է պատասխանները գրել հայատառ։",
  ].join("\n"),
  askName: "Ինչպե՞ս է կոչվում։\nՕրինակ՝ Սուրբ Գրիգոր Նարեկացի եկեղեցի",
  nameUnknown: "Եթե անունը չգիտեք, նկարագրեք կարճ, օրինակ՝ «Մատուռ Ագարակ գյուղի մոտ»։",
  askKind: "Ի՞նչ է սա։\n\nՀամալիր՝ մի քանի շինությունից բաղկացած տարածք, օրինակ՝ Մայր Աթոռ, Զվարթնոց։",
  kindHelp: "Ընտրեք ներքևի կոճակներից մեկը։",
  askRegion: "Ո՞ր մարզում և բնակավայրում է։\nՕրինակ՝ Արմավիրի մարզ, Վաղարշապատ",
  askLocation: [
    "Որտե՞ղ է գտնվում։",
    "",
    "📍 Եթե հիմա այնտեղ եք, սեղմեք ներքևի «Ուղարկել իմ գտնվելու վայրը» կոճակը։",
    "",
    "🗺 Եթե այնտեղ չեք՝ սեղմեք 📎 (կցել) → «Location» → տեղաշարժեք քարտեզը, որ նշիչը (📍) լինի եկեղեցու վրա → «Send selected location»։",
    "",
    "🔗 Կարող եք ուղարկել նաև հղում կամ կոորդինատներ՝",
    "• Google Maps",
    "• Apple Maps",
    "• Yandex Maps",
    "• կոորդինատներ, օրինակ՝ 40.1617, 44.2913",
  ].join("\n"),
  locationHelp: "Չհաջողվեց գտնել տեղը 🙏 Սեղմեք «📍 Ուղարկել իմ գտնվելու վայրը», կամ 📎 → «Location», կամ ուղարկեք Google, Apple, Yandex Maps-ի հղումը կամ կոորդինատները։",
  outside: "Այս կետը Հայաստանից դուրս է։ Քարտեզում առայժմ միայն Հայաստանի սրբավայրերն են. ստուգեք նշիչը և ուղարկեք նորից։",
  locationDone: "✅ Տեղը նշված է։",
  askPhotos: "Ուղարկեք լուսանկարներ և տեսանյութեր (մինչև 10 հատ)։ Ցանկալի է, որ գոնե մեկում կառույցի ամբողջական պատկերը երևա։\n\nԵրբ ավարտեք, սեղմեք «➡️ Հաջորդը»։",
  photoReceived: "📷 Լուսանկարը ստացանք։ Եթե ունեք այլ լուսանկարներ, կարող եք ուղարկել, կամ սեղմեք «➡️ Հաջորդը»։",
  photosHelp: "Այս քայլում սպասում ենք լուսանկարների կամ տեսանյութերի։ Եթե ուղարկելու բան չունեք, սեղմեք «⏭ Առանց լուսանկարի»։",
  tooMany: "Ստացանք 10 հատ, դա լիովին բավական է 🙏 Սեղմեք «➡️ Հաջորդը»։",
  askActive: "Գործո՞ղ եկեղեցի է, այսինքն՝ արարողություններ մատուցվո՞ւմ են այստեղ։",
  askLiturgy: "Ե՞րբ է մատուցվում Սուրբ Պատարագը։\nՕրինակ՝ կիրակի 11:00",
  askServicesHeld: "Ժամերգություններ կատարվո՞ւմ են։",
  askServices: "Նշեք ժամերգությունների օրերը և ժամերը։\nՕրինակ՝ երկուշաբթիից շաբաթ 09:30–10:00 և 17:00–17:30",
  noServices: "Չեն կատարվում",
  askClergy: "Ովքե՞ր են ծառայում այստեղ։\nԸնտրեք դերը, հետո գրեք անունը։ Կարող եք ավելացնել մի քանի մարդու։",
  askClergyMore: "Ավելացնե՞լ ևս մեկին։ Ընտրեք դերը կամ սեղմեք «➡️ Վերջ»։",
  askClergyName: "Գրեք անունը։",
  askClergyOther: "Գրեք դերը և անունը։\nՕրինակ՝ Դպիր՝ Արմեն Սարգսյան",
  clergyHelp: "Նախ ընտրեք դերը ներքևի կոճակներից։",
  askHours: "Օրվա ո՞ր ժամերին է բաց։\nՕրինակ՝ ամեն օր 09:00–18:00",
  askAccess: "Ինչպիսի՞ն է ճանապարհը մինչև եկեղեցի։\nԸնտրեք մեր առաջարկած տարբերակներից կամ նկարագրեք ինքներդ։ Օրինակ՝ մեքենան մնում է ներքևում, 200 մ արահետ",
  askEntrance: "Իսկ ինչպիսի՞ն է եկեղեցու մուտքը։\nԸնտրեք մեր առաջարկած տարբերակներից կամ նկարագրեք ինքներդ։",
  askHistory: "Ի՞նչ գիտեք այս տեղի մասին՝ ե՞րբ է կառուցվել, ո՞ւմ անունով է, ի՞նչ պատմություն ունի։",
  textHelp: "Գրեք պատասխանը տեքստով կամ սեղմեք «Չգիտեմ»։",
  askCredit: "Նյութը հրապարակելիս կցանկանայի՞ք, որ նշվի ձեր անունը, թե՞ նախընտրում եք մնալ անանուն։",
  reviewIntro: "Գրեթե պատրաստ է 👇 Ստուգեք ամեն ինչ։",
  reviewTitle: "Ահա ձեր ուղարկածը։ Եթե ամեն ինչ ճիշտ է, սեղմեք «✅ Ուղարկել»։ Փոխելու կամ լրացնելու համար՝ «✏️ Փոխել»։",
  chooseField: "Ի՞նչն եք ուզում փոխել կամ լրացնել։",
  editText: "Ահա, թե ինչ եք գրել։ Ի՞նչ անենք։",
  writeAppend: "Գրեք, թե ինչ ավելացնել։",
  writeReplace: "Գրեք նոր տարբերակը. այն կփոխարինի նախորդին։",
  editPhotos: "Ուղարկեք լրացուցիչ լուսանկարներ, կամ ջնջեք եղածները և ուղարկեք նորից։ Երբ ավարտեք, սեղմեք «✔️ Պատրաստ է»։",
  sent: "Շնորհակալ ենք աջակցության համար 🙏\nՁեր տրամադրած տեղեկությունը ստուգման փուլում է. հաստատվելու դեպքում այն կհրապարակվի քարտեզում։\n\nՍիրով՝ apostolic.am",
  cancelled: "Չեղարկվեց, ոչինչ չի ուղարկվել։ Կարող եք նորից սկսել /place հրամանով։",
  stale: "Այս ուղարկումն արդեն ավարտված է կամ չեղարկված։ Նորից սկսելու համար՝ /place",
  shareLocation: "📍 Ուղարկել իմ գտնվելու վայրը",
  next: "➡️ Հաջորդը",
  yes: "Այո",
  no: "Ոչ",
  done: "➡️ Վերջ",
  skip: "⏭ Բաց թողնել",
  unknown: "Չգիտեմ",
  noPhotos: "⏭ Առանց լուսանկարի",
  ready: "✔️ Պատրաստ է",
  clearPhotos: "🗑 Ջնջել լուսանկարները",
  anonymous: "Մնալ անանուն",
  cancel: "✖️ Չեղարկել",
  back: "↩️ Հետ՝ առանց փոփոխության",
  /** Buttons of earlier versions of /place, still on some readers' keyboards. */
  legacy: ["Ոչ, թող անանուն մնա", "✅ Ավարտել", "➡️ Շարունակել", "📍 Ուղարկել իմ տեղը", "♿ Այո, հարմար է", "Մասամբ (կան աստիճաններ)", "Ոչ, հարմար չէ", "♿ Հարթ է, սայլակով կարելի է", "Կան աստիճաններ", "Դժվար ճանապարհ (քարքարոտ, լեռնային)"],
};

/** /place's choice questions: what each button means, in the order the buttons show. */
export const PLACE_CHOICES = {
  kind: [["⛪ Եկեղեցի", "church"], ["Վանք", "monastery"], ["Մատուռ", "chapel"], ["Համալիր", "complex"], ["Սրբավայր", "shrine"]],
  active: [["Այո, գործող է", "yes"], ["Ոչ, չի գործում", "no"], ["Վերանորոգվում է", "renovation"]],
  // The way to the church, then its entrance: a flat road can still end at steps.
  access: [["🚗 Մեքենայով՝ մինչև եկեղեցի"], ["🚶 Մի քիչ ոտքով՝ հարթ ճանապարհ"], ["🥾 Դժվար արահետ (քարքարոտ, լեռնային)"]],
  entrance: [["♿ Առանց աստիճանների, սայլակով կարելի է"], ["Կա թեքահարթակ"], ["Մի քանի աստիճան"], ["Շատ աստիճաններ"]],
  // The ranks with their address forms (utils/clergy-titles.ts), then anyone else.
  clergy: [...CLERGY_RANKS.map((rank) => rank.role), "Այլ ծառայող"],
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
