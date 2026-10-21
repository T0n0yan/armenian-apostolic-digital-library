import { env } from "cloudflare:workers";

import { isLibraryPath } from "../utils/material-path";

type BotEnv = { TELEGRAM_BOT_TOKEN?: string; PUBLIC_URL?: string; SUPPORT_URL?: string };
type Update = {
  message?: {
    chat: { id: number; type: string };
    from?: { first_name?: string; language_code?: string };
    text?: string;
  };
};

const CONTACT_EMAIL = "info@apostolic.am";

function settings() {
  const { TELEGRAM_BOT_TOKEN: token, PUBLIC_URL: site, SUPPORT_URL: support } = env as BotEnv;
  return { token: token?.trim() || null, site: (site || "https://apostolic.am").replace(/\/+$/u, ""), support: support?.trim() || null };
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
  const { token, site, support } = settings();
  const message = update.message;
  if (!token || !message || message.chat.type !== "private") return;
  const text = (message.text ?? "").trim();
  const [command, payload = ""] = text.split(/\s+/u, 2);
  const name = message.from?.first_name?.trim();

  if (command === "/start") {
    // A deep link (t.me/bot?start=psalm_169) opens that material.
    // Start parameters can't hold "/": "saghmosner_22" stands for /saghmosner/22; old "psalm_169" works too.
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
      support ? `Հարցերի և առաջարկների համար՝ ${support}` : `Հարցերի և առաջարկների համար՝ ${CONTACT_EMAIL}`,
    ].join("\n"),
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: "📖 Բացել գրադարանը", web_app: { url: `${site}/` } }]] },
  });
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
