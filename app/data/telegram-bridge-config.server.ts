export type TelegramBridgeEnvironment = {
  TELEGRAM_BRIDGE_URL?: string;
  TELEGRAM_BRIDGE_SHARED_SECRET?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS?: string;
};

export class TelegramBridgeError extends Error {
  constructor(public readonly status: number, message = "Telegram Bridge request failed.") {
    super(message);
    this.name = "TelegramBridgeError";
  }
}

export function readTelegramBridgeConfiguration(environment: TelegramBridgeEnvironment) {
  const url = environment.TELEGRAM_BRIDGE_URL?.trim();
  const secret = environment.TELEGRAM_BRIDGE_SHARED_SECRET?.trim();
  if (!url || !secret || !/^[a-zA-Z0-9_-]{32,256}$/u.test(secret)) {
    throw new TelegramBridgeError(503, "Telegram Bridge is not configured.");
  }

  let origin: URL;
  try { origin = new URL(url); } catch { throw new TelegramBridgeError(503, "Telegram Bridge is not configured."); }
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) {
    throw new TelegramBridgeError(503, "Telegram Bridge URL must use HTTPS.");
  }

  const accessClientId = environment.CF_ACCESS_CLIENT_ID?.trim() || null;
  const accessClientSecret = environment.CF_ACCESS_CLIENT_SECRET?.trim() || null;
  if (Boolean(accessClientId) !== Boolean(accessClientSecret)) {
    throw new TelegramBridgeError(503, "Cloudflare Access service token configuration is incomplete.");
  }
  const configuredTimeout = environment.TELEGRAM_BRIDGE_REQUEST_TIMEOUT_MS?.trim();
  const requestTimeoutMs = configuredTimeout ? Number(configuredTimeout) : 20_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120_000) {
    throw new TelegramBridgeError(503, "Telegram Bridge request timeout is invalid.");
  }

  return {
    origin,
    secret,
    access: accessClientId && accessClientSecret
      ? { clientId: accessClientId, clientSecret: accessClientSecret }
      : null,
    requestTimeoutMs,
  };
}
