import { env } from "cloudflare:workers";

type TelegramEnvironment = Env & {
  TELEGRAM_BOT_TOKEN?: string;
};

type TelegramInitUser = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type SessionPayload = {
  id: string;
  /** Telegram user id; for Google accounts "google:<sub>" (no bot can message them). */
  telegramId: string;
  displayName: string;
  username: string | null;
  provider?: "telegram" | "google";
  expiresAt: number;
};

export type TelegramUserIdentity = Omit<SessionPayload, "expiresAt"> & {
  source: "telegram" | "google" | "local-development";
};

export type TelegramUserState =
  | { status: "authenticated"; user: TelegramUserIdentity }
  | { status: "guest" | "invalid" | "unavailable"; user: null };

export async function getTelegramUserCacheScope(user: TelegramUserIdentity | null) {
  if (!user) return "guest";
  const botToken = getBotToken();
  if (!botToken) return "guest";
  const key = await getSessionKey(botToken);
  const signature = await signHmac(key, encoder.encode(user.id));
  return `telegram:${toHex(signature).slice(0, 32)}`;
}

const SESSION_COOKIE = "library_telegram_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24;
const encoder = new TextEncoder();

function isLocalDevelopmentRequest(request: Request) {
  if (!import.meta.env.DEV) return false;
  const hostname = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }

  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function getBotToken() {
  return (env as TelegramEnvironment).TELEGRAM_BOT_TOKEN?.trim() || null;
}

async function signHmac(key: Uint8Array, value: Uint8Array) {
  const keyBuffer = Uint8Array.from(key).buffer;
  const valueBuffer = Uint8Array.from(value).buffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, valueBuffer));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function encodeBase64Url(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

async function getSessionKey(botToken: string) {
  return signHmac(encoder.encode("LibraryTelegramSession"), encoder.encode(botToken));
}

async function validateTelegramInitData(initData: string, botToken: string) {
  if (!initData || initData.length > 16_384) return null;

  const parameters = new URLSearchParams(initData);
  const receivedHash = parameters.get("hash")?.toLowerCase();
  const authDate = Number(parameters.get("auth_date"));
  const userJson = parameters.get("user");
  if (!receivedHash || !/^[a-f0-9]{64}$/.test(receivedHash) || !userJson) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(authDate) ||
    authDate > now + 300 ||
    now - authDate > INIT_DATA_MAX_AGE_SECONDS
  ) {
    return null;
  }

  parameters.delete("hash");
  const dataCheckString = Array.from(parameters.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await signHmac(
    encoder.encode("WebAppData"),
    encoder.encode(botToken),
  );
  const calculatedHash = toHex(
    await signHmac(secretKey, encoder.encode(dataCheckString)),
  );
  if (!constantTimeEqual(receivedHash, calculatedHash)) return null;

  try {
    const user = JSON.parse(userJson) as TelegramInitUser;
    const telegramId = String(user.id ?? "");
    if (!/^\d{1,20}$/.test(telegramId)) return null;
    const displayName = [user.first_name, user.last_name]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim()
      .slice(0, 160);
    if (!displayName) return null;

    return {
      id: `telegram:${telegramId}`,
      telegramId,
      displayName,
      username:
        typeof user.username === "string" && user.username.trim()
          ? user.username.trim().slice(0, 64)
          : null,
    };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }
  return null;
}

async function readSignedSession(request: Request, botToken: string) {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;
  const separator = cookie.lastIndexOf(".");
  if (separator < 1) return null;

  const encodedPayload = cookie.slice(0, separator);
  const receivedSignature = cookie.slice(separator + 1);
  const sessionKey = await getSessionKey(botToken);
  const calculatedSignature = toHex(
    await signHmac(sessionKey, encoder.encode(encodedPayload)),
  );
  if (!constantTimeEqual(receivedSignature, calculatedSignature)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (
      typeof payload.id !== "string" ||
      typeof payload.telegramId !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getOptionalTelegramUser(
  request: Request,
): Promise<TelegramUserIdentity | null> {
  return (await getTelegramUserState(request)).user;
}

export async function getTelegramUserState(request: Request): Promise<TelegramUserState> {
  if (isLocalDevelopmentRequest(request)) {
    return { status: "authenticated", user: {
      id: "local-development",
      telegramId: "local-development",
      displayName: "Փորձնական օգտվող",
      username: null,
      source: "local-development",
    } };
  }

  const botToken = getBotToken();
  if (!botToken) return { status: "unavailable", user: null };
  if (!readCookie(request, SESSION_COOKIE)) return { status: "guest", user: null };
  const payload = await readSignedSession(request, botToken);
  if (!payload) return { status: "invalid", user: null };

  return { status: "authenticated", user: { ...payload, source: payload.provider ?? "telegram" } };
}

export async function requireTelegramUser(request: Request) {
  const user = await getOptionalTelegramUser(request);
  if (!user) {
    throw new Response("Telegram authentication is required.", {
      status: 401,
      statusText: "Unauthorized",
    });
  }
  return user;
}

export function requireSameOriginUserRequest(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    throw new Response("Cross-origin request is not allowed.", {
      status: 403,
      statusText: "Forbidden",
    });
  }
}

/** A signed session cookie for a signed-in reader (Telegram or Google). */
export async function createSessionCookie(request: Request, identity: Omit<SessionPayload, "expiresAt">) {
  const botToken = getBotToken();
  if (!botToken) return null;
  const payload: SessionPayload = { ...identity, expiresAt: Date.now() + SESSION_SECONDS * 1000 };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = toHex(
    await signHmac(await getSessionKey(botToken), encoder.encode(encodedPayload)),
  );
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

/** Signs the reader out. */
export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export async function createTelegramSession(request: Request, initData: string) {
  const botToken = getBotToken();
  if (!botToken || isLocalDevelopmentRequest(request)) return null;
  const user = await validateTelegramInitData(initData, botToken);
  if (!user) return null;
  const cookie = await createSessionCookie(request, { ...user, provider: "telegram" });
  if (!cookie) return null;
  return { user: { ...user, source: "telegram" as const }, cookie };
}

export async function upsertAppUser(
  database: D1Database,
  user: TelegramUserIdentity,
) {
  await database
    .prepare(
      `INSERT INTO app_users (id, telegram_id, display_name, username)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         username = excluded.username,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       -- D1 bills row writes: touch the row only when something changed or a few hours passed.
       WHERE app_users.display_name IS NOT excluded.display_name
         OR app_users.username IS NOT excluded.username
         OR app_users.last_seen_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours')`,
    )
    .bind(user.id, user.telegramId, user.displayName, user.username)
    .run();
}
