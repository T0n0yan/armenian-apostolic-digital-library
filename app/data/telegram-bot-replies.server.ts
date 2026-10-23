import { env } from "cloudflare:workers";
import { CONTACT_EMAIL, SUPPORT_EMAIL } from "../utils/contact";

import { isLibraryPath } from "../utils/material-path";
import { readerIdFrom, relayedText, SUPPORT_PROMPTS, supportHeader, supportKindFor, type SupportKind } from "../utils/support-relay";

type BotEnv = {
  TELEGRAM_BOT_TOKEN?: string; PUBLIC_URL?: string; SUPPORT_URL?: string;
  SUPPORT_CHAT_ID?: string; SUPPORT_TOPIC_SUPPORT?: string; SUPPORT_TOPIC_CONTACT?: string;
};
type User = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string; language_code?: string };
type Message = {
  message_id: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  chat: { id: number; type: string };
  from?: User;
  text?: string;
  caption?: string;
  photo?: unknown; video?: unknown; document?: unknown; audio?: unknown; voice?: unknown; animation?: unknown;
  reply_to_message?: Message;
};
type Update = { message?: Message };


function settings() {
  const { TELEGRAM_BOT_TOKEN: token, PUBLIC_URL: site, SUPPORT_URL: support, SUPPORT_CHAT_ID: supportChat, SUPPORT_TOPIC_SUPPORT: supportTopic, SUPPORT_TOPIC_CONTACT: contactTopic } = env as BotEnv;
  const topic = (value?: string) => Number(value?.trim()) || undefined;
  return {
    token: token?.trim() || null,
    site: (site || "https://apostolic.am").replace(/\/+$/u, ""),
    support: support?.trim() || null,
    // The private group where readers' messages arrive (empty: the relay is off).
    relay: Number(supportChat?.trim()) ? { chat: Number(supportChat), topics: { support: topic(supportTopic), contact: topic(contactTopic) } as Record<SupportKind, number | undefined> } : null,
  };
}

export async function callTelegram(token: string, method: string, body: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await response?.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null) ?? { ok: false };
}

/** The secret Telegram sends with every webhook call, derived from the bot token. */
export async function webhookSecret(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`library-webhook:${token}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

/**
 * Replies in the bot's private chat: /start greets the reader with a button that opens the
 * library (or the material a link pointed to, /start psalm_169), /help explains what the bot
 * does and where to ask for help. Anything else gets the same short help.
 */
export async function answerUpdate(update: Update) {
  const { token, site, support, relay } = settings();
  const message = update.message;
  if (!token || !message) return;
  if (message.chat.type === "group" || message.chat.type === "supergroup") return answerGroup(token, relay, message);
  if (message.chat.type !== "private") return;
  const text = (message.text ?? "").trim();
  const [command, payload = ""] = text.split(/\s+/u, 2);
  const name = message.from?.first_name?.trim();

  // /support, /contact, or the group welcome's «Գրել մեզ» button (t.me/bot?start=contact).
  const asks = command === "/start" && (payload === "contact" || payload === "support") ? `/${payload}` : command;
  if (relay && (asks === "/support" || asks === "/contact")) {
    await callTelegram(token, "sendMessage", {
      chat_id: message.chat.id,
      text: SUPPORT_PROMPTS[asks === "/support" ? "support" : "contact"],
      reply_markup: { force_reply: true, input_field_placeholder: "Ձեր հաղորդագրությունը…" },
    });
    return;
  }
  // Anything that isn't a command is a message for the team.
  if (relay && message.from && !text.startsWith("/")) {
    const kind = supportKindFor(message.reply_to_message?.text);
    const header = supportHeader(kind, message.from);
    const target = { chat_id: relay.chat, message_thread_id: relay.topics[kind] };
    const captioned = message.photo || message.video || message.document || message.audio || message.voice || message.animation;
    const sent = message.text
      ? await callTelegram(token, "sendMessage", { ...target, text: relayedText(header, message.text, 4096) })
      : captioned
        ? await callTelegram(token, "copyMessage", { ...target, from_chat_id: message.chat.id, message_id: message.message_id, caption: relayedText(header, message.caption ?? "", 1024) })
        // Stickers, locations… can't carry a caption: the header goes first, the message under it.
        : await callTelegram(token, "sendMessage", { ...target, text: header }).then(async (posted) => posted.ok
          ? callTelegram(token, "copyMessage", { ...target, from_chat_id: message.chat.id, message_id: message.message_id, reply_parameters: { message_id: (posted.result as { message_id: number }).message_id } })
          : posted);
    await callTelegram(token, "sendMessage", {
      chat_id: message.chat.id,
      text: sent.ok ? "Ստացանք ✅ Կպատասխանենք այստեղ՝ որքան հնարավոր է շուտ։" : `Չհաջողվեց ուղարկել 😔 Խնդրում ենք գրել ${SUPPORT_EMAIL}`,
    });
    return;
  }

  if (command === "/start") {
    // A deep link (t.me/bot?start=psalm_169) opens that material.
    // Start parameters can't hold "/": "psalms_22" stands for /psalms/22; old "psalm_169" works too.
    const candidate = `/${payload.replace(/^([a-z-]+)_(?=[0-9])/u, "$1/")}`;
    const path = /^[a-z0-9_-]{1,64}$/u.test(payload) && isLibraryPath(candidate) ? candidate : /^[a-z]+_\d{1,12}$/u.test(payload) && isLibraryPath(`/${payload}`) ? `/${payload}` : "/";
    await callTelegram(token, "sendMessage", {
      chat_id: message.chat.id,
      text: [
        `Բարի գալուստ${name ? `, ${name}` : ""} ✠`,
        "",
        "«Հոգևոր ժառանգություն»-ը Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարանն է՝",
        "• աղոթքներ՝ ըստ օրվա ժամի և առիթի",
        "• սաղմոսներ՝ ձայնագրությամբ",
        "• սրբերի վարքեր և Ավետարանի ուսուցում",
        "• օրվա ընթերցումներ և հարցեր Աստվածաշնչից",
        "",
        "Սեղմեք ներքևի կոճակը՝ գրադարանը բացելու համար։ Կարող եք պահել նյութեր, դնել հիշեցումներ և նշել կարդացածը։",
      ].join("\n"),
      reply_markup: { inline_keyboard: [[{ text: path === "/" ? "📖 Բացել գրադարանը" : "📖 Բացել նյութը", web_app: { url: `${site}${path}` } }]] },
    });
    return;
  }

  await callTelegram(token, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      command === "/help" ? "Ինչով կարող եմ օգնել" : "Ես կարդում եմ միայն հրամաններ 🙂",
      "",
      "📖 Գրադարանը բացելու համար սեղմեք «Գրադարան» կոճակը կամ ներքևի կոճակը։",
      "🔔 Հիշեցումները գալիս են այստեղ՝ ձեր դրած ժամին։",
      "🌐 Կայքը՝ " + site.replace(/^https?:\/\//u, ""),
      "",
      ...(relay
        ? ["✉️ Հարց կամ առաջարկ՝ /contact", "🛠 Տեխնիկական խնդիր՝ /support", "", `Էլ. փոստ՝ ${CONTACT_EMAIL}, ${SUPPORT_EMAIL}`]
        : [support ? `Հարցերի և առաջարկների համար՝ ${support}` : `Հարցերի և առաջարկների համար՝ ${CONTACT_EMAIL}`, `Տեխնիկական խնդիրների համար՝ ${SUPPORT_EMAIL}`]),
    ].join("\n"),
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "📖 Բացել գրադարանը", web_app: { url: `${site}/` } }]] },
  });
}

/**
 * In groups the bot answers only two things: /chatid (so the owner can find the support group's
 * and topics' ids) and, in the support group, an admin's reply to a relayed message, which is
 * copied to that reader.
 */
async function answerGroup(token: string, relay: ReturnType<typeof settings>["relay"], message: Message) {
  const text = (message.text ?? "").trim();
  if (/^\/chatid(@\w+)?$/u.test(text)) {
    await callTelegram(token, "sendMessage", {
      chat_id: message.chat.id,
      message_thread_id: message.is_topic_message ? message.message_thread_id : undefined,
      text: [`chat: ${message.chat.id}`, message.is_topic_message ? `topic: ${message.message_thread_id}` : "topic: General"].join("\n"),
    });
    return;
  }
  const replied = message.reply_to_message;
  const botId = Number(token.split(":")[0]);
  if (!relay || message.chat.id !== relay.chat || !replied || replied.from?.id !== botId || text.startsWith("/")) return;
  const reader = readerIdFrom(replied.text ?? replied.caption);
  if (!reader) return;
  const sent = await callTelegram(token, "copyMessage", { chat_id: reader, from_chat_id: message.chat.id, message_id: message.message_id });
  if (sent.ok) {
    await callTelegram(token, "setMessageReaction", { chat_id: message.chat.id, message_id: message.message_id, reaction: [{ type: "emoji", emoji: "👍" }] });
  } else {
    await callTelegram(token, "sendMessage", {
      chat_id: message.chat.id,
      message_thread_id: message.is_topic_message ? message.message_thread_id : undefined,
      reply_parameters: { message_id: message.message_id },
      text: "❌ Չհաջողվեց ուղարկել. հավանաբար մարդը արգելափակել է բոտը։",
    });
  }
}

/** The welcome the bot posts and pins in the main group, until the owner writes their own in /admin. */
export const GROUP_WELCOME = [
  "Բարև, սիրելի՛ քրիստոնյա ☺️🙏",
  "",
  "Խմբում հրապարակվող 📿 աղոթքները, 🎧 ձայնագրված սաղմոսները, 🕊 սրբերի վարքերը, 📖 Ավետարանի ուսուցումները և 🗓 օրվա ընթերցումները հասանելի են նաև մեր թվային գրադարանում ✨",
  "",
  "Գրադարանում կարող ես՝",
  "🔍 արագ որոնել անհրաժեշտ նյութը,",
  "🔖 պահպանել նախընտրած նյութերը,",
  "📝 ստեղծել անձնական նշումներ և 🔔 հիշեցումներ։",
  "",
  "📱 Գրադարանը բացվում է անմիջապես Telegram-ում՝ ներքևի կոճակով 👇",
  "",
  "💬 Հարցերի և առաջարկների համար կարող ես գրել մեզ՝ «Կապ մեզ հետ» կոճակով։",
].join("\n");

/**
 * Posts the welcome with its buttons, without a sound. With `pin`, it is also pinned, again
 * without notifying anyone. Buttons in groups can't open a Mini App directly, so «Բացել
 * Telegram-ում» is the bot's ?startapp link, which opens the library inside Telegram.
 */
/** The welcome text as saved in /admin (site_settings), or the default above. */
export async function readGroupWelcome(db: D1Database) {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'group_welcome'").first<{ value: string }>().catch(() => null);
  return row?.value?.trim() || GROUP_WELCOME;
}

/** Saves the owner's welcome text; an empty text brings the default back. */
export async function saveGroupWelcome(db: D1Database, text: string) {
  const value = text.replace(/\r\n/gu, "\n").trim();
  if (!value || value === GROUP_WELCOME) {
    await db.prepare("DELETE FROM site_settings WHERE key = 'group_welcome'").run();
    return;
  }
  await db.prepare("INSERT INTO site_settings (key, value) VALUES ('group_welcome', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(value.slice(0, 4000)).run();
}

export async function postGroupWelcome(chatId: string | number, pin: boolean, text = GROUP_WELCOME) {
  const { token, site } = settings();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN չկա" };
  const me = await callTelegram(token, "getMe", {});
  const username = (me.result as { username?: string } | undefined)?.username;
  if (!username) return { ok: false, description: me.description ?? "getMe failed" };
  const sent = await callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_notification: true,
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [
      [{ text: "📱 Բացել Telegram-ում", url: `https://t.me/${username}?startapp` }],
      [{ text: "🌐 Բացել բրաուզերում", url: site }, { text: "✉️ Կապ մեզ հետ", url: `https://t.me/${username}?start=contact` }],
    ] },
  });
  if (!sent.ok || !pin) return sent;
  const messageId = (sent.result as { message_id: number }).message_id;
  const pinned = await callTelegram(token, "pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
  return pinned.ok ? sent : { ok: false, description: `Ուղարկվեց, բայց չամրացվեց. ${pinned.description ?? ""}` };
}

/** Points the bot's webhook at this site and sets its command list. */
export async function connectBot() {
  const { token, site } = settings();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN չկա" };
  const hook = await callTelegram(token, "setWebhook", {
    url: `${site}/telegram/webhook`,
    secret_token: await webhookSecret(token),
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (!hook.ok) return hook;
  await callTelegram(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Բացել գրադարանը" },
      { command: "help", description: "Օգնություն և կապ" },
      ...(settings().relay ? [
        { command: "contact", description: "Հարց կամ առաջարկ" },
        { command: "support", description: "Տեխնիկական խնդիր" },
      ] : []),
    ],
  });
  return hook;
}

export async function botStatus() {
  const { token, site } = settings();
  if (!token) return null;
  const info = await callTelegram(token, "getWebhookInfo", {});
  const result = info.result as { url?: string; last_error_message?: string; pending_update_count?: number } | undefined;
  return { connected: result?.url === `${site}/telegram/webhook`, url: result?.url ?? "", lastError: result?.last_error_message ?? null };
}
