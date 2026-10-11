import { env } from "cloudflare:workers";

type TelegramBotEnvironment = Env & {
  TELEGRAM_BOT_TOKEN?: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUser = {
  id: number;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
};

type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  text?: string;
  from?: TelegramUser;
  chat: TelegramChat;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

export class TelegramBotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramBotError";
  }
}

function getBotToken() {
  const token = (env as TelegramBotEnvironment).TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new TelegramBotError("Telegram bot token-ը կարգավորված չէ։");
  }
  return token;
}

async function telegramApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json().catch(() => null)) as
    | TelegramApiResponse<T>
    | null;

  if (!response.ok || !payload?.ok || payload.result === undefined) {
    throw new TelegramBotError(
      payload?.description ?? `Telegram API-ի ${method} գործողությունը ձախողվեց։`,
    );
  }
  return payload.result;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function configureTelegramWebhook(request: Request) {
  const token = getBotToken();
  const webhookUrl = new URL("/telegram/webhook", request.url).toString();
  const secretToken = await sha256Hex(token);

  await telegramApi<boolean>(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });

  const bot = await telegramApi<TelegramUser>(token, "getMe");
  return { username: bot.username ?? null, webhookUrl };
}

async function isAuthenticWebhook(request: Request, token: string) {
  const supplied =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? "";
  const expected = await sha256Hex(token);
  return timingSafeEqual(supplied, expected);
}

function isLibraryCommand(text: string | undefined) {
  const command = text?.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase("en-US");
  return command === "/library" || command?.startsWith("/library@") === true;
}

async function reserveUpdate(database: D1Database, updateId: number) {
  const result = await database
    .prepare("INSERT OR IGNORE INTO telegram_bot_updates (update_id) VALUES (?)")
    .bind(updateId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

async function findAdminUser(database: D1Database, telegramId: string) {
  return database
    .prepare(
      `SELECT id
       FROM app_users
       WHERE telegram_id = ? AND role = 'admin'
       LIMIT 1`,
    )
    .bind(telegramId)
    .first<{ id: string }>();
}

async function publishGroupLaunch(
  database: D1Database,
  token: string,
  message: TelegramMessage,
  connectedByUserId: string,
) {
  const bot = await telegramApi<TelegramUser>(token, "getMe");
  if (!bot.username) {
    throw new TelegramBotError("Bot-ի username-ը հասանելի չէ։");
  }

  const launchUrl = `https://t.me/${bot.username}?startapp=library`;
  const launchMessage = await telegramApi<TelegramMessage>(token, "sendMessage", {
    chat_id: message.chat.id,
    ...(message.message_thread_id
      ? { message_thread_id: message.message_thread_id }
      : {}),
    text: "📚 <b>Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան</b>\n\nԳտիր խմբում հրապարակված նյութերը, պահիր քեզ անհրաժեշտ գրառումները և արագ վերադարձիր սկզբնական Telegram հրապարակմանը։",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Բացել թվային գրադարանը", url: launchUrl }],
      ],
    },
  });

  await telegramApi<boolean>(token, "pinChatMessage", {
    chat_id: message.chat.id,
    message_id: launchMessage.message_id,
    disable_notification: true,
  });

  await database
    .prepare(
      `INSERT INTO telegram_group_integrations (
         chat_id,
         chat_title,
         chat_type,
         launch_message_id,
         connected_by_user_id
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         chat_title = excluded.chat_title,
         chat_type = excluded.chat_type,
         launch_message_id = excluded.launch_message_id,
         connected_by_user_id = excluded.connected_by_user_id,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      String(message.chat.id),
      message.chat.title?.trim() || "Telegram խումբ",
      message.chat.type,
      launchMessage.message_id,
      connectedByUserId,
    )
    .run();
}

export async function handleTelegramWebhook(
  request: Request,
  database: D1Database,
) {
  const token = getBotToken();
  if (!(await isAuthenticWebhook(request, token))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || !Number.isSafeInteger(update.update_id)) {
    return new Response("Bad Request", { status: 400 });
  }
  if (!(await reserveUpdate(database, update.update_id))) {
    return Response.json({ ok: true, duplicate: true });
  }

  const message = update.message;
  if (
    !message ||
    !message.from ||
    !isLibraryCommand(message.text) ||
    (message.chat.type !== "group" && message.chat.type !== "supergroup")
  ) {
    return Response.json({ ok: true });
  }

  const admin = await findAdminUser(database, String(message.from.id));
  if (!admin) {
    return Response.json({ ok: true });
  }

  try {
    await publishGroupLaunch(database, token, message, admin.id);
  } catch (error) {
    console.error(
      "Failed to publish Telegram group launch message",
      error instanceof Error ? error.message : error,
    );
  }

  return Response.json({ ok: true });
}
