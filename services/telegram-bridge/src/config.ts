export type BridgeConfig = {
  host: string;
  port: number;
  adapter: "gramjs" | "mock";
  sharedSecret: string;
  allowedChatIds: string[];
  apiId: number | null;
  apiHash: string | null;
  session: string | null;
  mediaConcurrency: number;
  mediaTimeoutMs: number;
};

function integer(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readBridgeConfig(environment: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const adapter = environment.TELEGRAM_BRIDGE_ADAPTER === "mock" ? "mock" : "gramjs";
  const sharedSecret = environment.TELEGRAM_BRIDGE_SHARED_SECRET?.trim() ?? "";
  const allowedChatIds = (environment.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^-?\d{1,20}$/u.test(value));
  const apiId = Number(environment.TELEGRAM_API_ID);
  const config: BridgeConfig = {
    host: environment.TELEGRAM_BRIDGE_HOST?.trim() || "127.0.0.1",
    port: integer(environment.TELEGRAM_BRIDGE_PORT, 8788),
    adapter,
    sharedSecret,
    allowedChatIds,
    apiId: Number.isSafeInteger(apiId) && apiId > 0 ? apiId : null,
    apiHash: environment.TELEGRAM_API_HASH?.trim() || null,
    session: environment.TELEGRAM_SESSION?.trim() || null,
    mediaConcurrency: integer(environment.TELEGRAM_MEDIA_CONCURRENCY, 3),
    mediaTimeoutMs: integer(environment.TELEGRAM_MEDIA_TIMEOUT_MS, 120_000),
  };
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(config.sharedSecret)) {
    throw new Error("TELEGRAM_BRIDGE_SHARED_SECRET is required and must be URL-safe.");
  }
  if (config.allowedChatIds.length === 0) throw new Error("TELEGRAM_ALLOWED_CHAT_IDS is required.");
  if (adapter === "gramjs" && (!config.apiId || !config.apiHash || !config.session)) {
    throw new Error("GramJS requires TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION.");
  }
  return config;
}
