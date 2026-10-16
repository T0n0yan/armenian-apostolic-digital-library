export type BridgeConfig = {
  host: string;
  port: number;
  adapter: "gramjs" | "mock";
  sharedSecret: string;
  allowedChatIds: string[];
  contentChatId: string;
  apiId: number | null;
  apiHash: string | null;
  session: string | null;
  requestConcurrency: number;
  requestTimeoutMs: number;
  mediaConcurrency: number;
  mediaTimeoutMs: number;
  shutdownGraceMs: number;
  searchIndexTtlMs: number;
  searchIndexMaximumDocuments: number;
  searchIndexMaximumTextCharacters: number;
  searchIndexBuildTimeoutMs: number;
};

export const DEFAULT_SEARCH_INDEX_MAX_DOCUMENTS = 10_000;
export const DEFAULT_SEARCH_INDEX_MAX_CHARACTERS = 20_000_000;
export const MAXIMUM_SEARCH_INDEX_MAX_DOCUMENTS = 50_000;
export const MAXIMUM_SEARCH_INDEX_MAX_CHARACTERS = 100_000_000;

export function activeContentChatIds(config: Pick<BridgeConfig, "contentChatId">) {
  return [config.contentChatId];
}

function integer(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
  minimum = 1,
) {
  const value = environment[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function readBridgeConfig(environment: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const adapter = environment.TELEGRAM_BRIDGE_ADAPTER === "mock" ? "mock" : "gramjs";
  const sharedSecret = environment.TELEGRAM_BRIDGE_SHARED_SECRET?.trim() ?? "";
  const configuredChatIds = (environment.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredChatIds.some((value) => !/^-?\d{1,20}$/u.test(value))) {
    throw new Error("TELEGRAM_ALLOWED_CHAT_IDS contains an invalid Telegram chat ID.");
  }
  const allowedChatIds = [...new Set(configuredChatIds)];
  const configuredContentChatId = environment.TELEGRAM_CONTENT_CHAT_ID?.trim() ?? "";
  if (configuredContentChatId && !/^-?\d{1,20}$/u.test(configuredContentChatId)) {
    throw new Error("TELEGRAM_CONTENT_CHAT_ID contains an invalid Telegram chat ID.");
  }
  const contentChatId = configuredContentChatId || (allowedChatIds.length === 1 ? allowedChatIds[0] : "");
  const apiId = Number(environment.TELEGRAM_API_ID);
  const config: BridgeConfig = {
    host: environment.TELEGRAM_BRIDGE_HOST?.trim() || "127.0.0.1",
    port: integer(environment, "TELEGRAM_BRIDGE_PORT", 8788, 65_535),
    adapter,
    sharedSecret,
    allowedChatIds,
    contentChatId,
    apiId: Number.isSafeInteger(apiId) && apiId > 0 ? apiId : null,
    apiHash: environment.TELEGRAM_API_HASH?.trim() || null,
    session: environment.TELEGRAM_SESSION?.trim() || null,
    requestConcurrency: integer(environment, "TELEGRAM_REQUEST_CONCURRENCY", 32, 1_000),
    requestTimeoutMs: integer(environment, "TELEGRAM_REQUEST_TIMEOUT_MS", 30_000, 600_000),
    mediaConcurrency: integer(environment, "TELEGRAM_MEDIA_CONCURRENCY", 3, 100),
    mediaTimeoutMs: integer(environment, "TELEGRAM_MEDIA_TIMEOUT_MS", 120_000, 3_600_000),
    shutdownGraceMs: integer(environment, "TELEGRAM_SHUTDOWN_GRACE_MS", 30_000, 300_000),
    searchIndexTtlMs: integer(environment, "TELEGRAM_SEARCH_INDEX_TTL_MS", 30_000, 3_600_000),
    searchIndexMaximumDocuments: integer(
      environment,
      "TELEGRAM_SEARCH_INDEX_MAX_DOCUMENTS",
      DEFAULT_SEARCH_INDEX_MAX_DOCUMENTS,
      MAXIMUM_SEARCH_INDEX_MAX_DOCUMENTS,
    ),
    searchIndexMaximumTextCharacters: integer(
      environment,
      "TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS",
      DEFAULT_SEARCH_INDEX_MAX_CHARACTERS,
      MAXIMUM_SEARCH_INDEX_MAX_CHARACTERS,
      10_000,
    ),
    searchIndexBuildTimeoutMs: integer(environment, "TELEGRAM_SEARCH_BUILD_TIMEOUT_MS", 60_000, 600_000),
  };
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(config.sharedSecret)) {
    throw new Error("TELEGRAM_BRIDGE_SHARED_SECRET is required and must be URL-safe.");
  }
  if (config.allowedChatIds.length === 0) throw new Error("TELEGRAM_ALLOWED_CHAT_IDS is required.");
  if (!config.contentChatId) {
    throw new Error("TELEGRAM_CONTENT_CHAT_ID is required when more than one Telegram chat is allowlisted.");
  }
  if (!config.allowedChatIds.includes(config.contentChatId)) {
    throw new Error("TELEGRAM_CONTENT_CHAT_ID must be included in TELEGRAM_ALLOWED_CHAT_IDS.");
  }
  if (adapter === "gramjs" && (!config.apiId || !config.apiHash || !config.session)) {
    throw new Error("GramJS requires TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION.");
  }
  return config;
}
