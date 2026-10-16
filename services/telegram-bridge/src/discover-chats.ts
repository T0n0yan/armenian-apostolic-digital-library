import { loadEnvFile, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { TelegramClient } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";

import { assertLocalSecretFile, readTelegramSessionCredentials } from "./authorization-env";
import {
  collectDiscoverableTelegramChats,
  describeTelegramChat,
  maskTelegramAccountId,
} from "./chat-discovery";
import { ensureLocalBridgeSharedSecret } from "./local-shared-secret";

const BRIDGE_ENVIRONMENT = fileURLToPath(new URL("../.env.local", import.meta.url));
const WORKER_ENVIRONMENT = fileURLToPath(new URL("../../../.dev.vars", import.meta.url));
const WORKER_TEMPLATE = fileURLToPath(new URL("../../../.dev.vars.example", import.meta.url));

function readMetadataLookupUsername(environment: NodeJS.ProcessEnv) {
  const username = environment.TELEGRAM_DISCOVERY_USERNAME?.trim().replace(/^@/u, "");
  if (!username) return null;
  if (!/^[a-z][a-z0-9_]{3,31}$/iu.test(username)) {
    throw new Error("TELEGRAM_DISCOVERY_USERNAME is not a valid public Telegram username.");
  }
  return username;
}

async function discoverChats() {
  if (process.argv.length > 2) throw new Error("This command does not accept command-line arguments.");
  await assertLocalSecretFile(BRIDGE_ENVIRONMENT);
  loadEnvFile(BRIDGE_ENVIRONMENT);
  const credentials = readTelegramSessionCredentials(process.env);
  const secretStatus = await ensureLocalBridgeSharedSecret({
    bridgeEnvironment: BRIDGE_ENVIRONMENT,
    workerEnvironment: WORKER_ENVIRONMENT,
    workerTemplate: WORKER_TEMPLATE,
  });

  const client = new TelegramClient(
    new StringSession(credentials.session),
    credentials.apiId,
    credentials.apiHash,
    { connectionRetries: 5, autoReconnect: false, baseLogger: new Logger(LogLevel.NONE) },
  );
  client.setLogLevel(LogLevel.NONE);
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) throw new Error("The Telegram session is not authorized.");
    const account = await client.getMe();
    stdout.write(`Authorized Telegram account: ${maskTelegramAccountId(account.id.toString())}\n`);
    stdout.write("Connection: successful\n");
    stdout.write(`Local Bridge shared secret: ${secretStatus.bridgeConfigured && secretStatus.workerConfigured ? "configured on Bridge and Worker" : "not configured"}\n`);

    const uniqueChats = await collectDiscoverableTelegramChats((folder) => client.iterDialogs({
      folder,
      ignoreMigrated: false,
      limit: undefined,
    }));

    stdout.write("\nTitle\tUsername\tChat ID\tType\tForum\n");
    for (const chat of uniqueChats) {
      stdout.write(`${chat.title}\t${chat.username ? `@${chat.username}` : "—"}\t${chat.chatId}\t${chat.type}\t${chat.forum ? "yes" : "no"}\n`);
    }

    const lookupUsername = readMetadataLookupUsername(process.env);
    if (lookupUsername) {
      const lookup = describeTelegramChat(await client.getEntity(lookupUsername));
      if (!lookup) throw new Error("The requested Telegram username is not a group or channel.");
      stdout.write("\nMetadata lookup (no history requested)\n");
      stdout.write("Title\tUsername\tChat ID\tType\tForum\n");
      stdout.write(`${lookup.title}\t${lookup.username ? `@${lookup.username}` : "—"}\t${lookup.chatId}\t${lookup.type}\t${lookup.forum ? "yes" : "no"}\n`);
    }
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

discoverChats().catch((error: unknown) => {
  const safeMessage = error instanceof Error && (
    error.message.startsWith("TELEGRAM_API_")
    || error.message.startsWith("TELEGRAM_SESSION")
    || error.message.startsWith("The local")
    || error.message.startsWith("This command")
    || error.message.startsWith("TELEGRAM_DISCOVERY_USERNAME")
    || error.message.startsWith("The requested Telegram username")
  ) ? error.message : "Telegram chat discovery failed without changing the allowlist.";
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
