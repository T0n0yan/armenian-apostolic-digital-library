import { loadEnvFile, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { TelegramClient } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";

import { assertLocalSecretFile, readTelegramSessionCredentials } from "./authorization-env";
import { describeTelegramChat, maskTelegramAccountId } from "./chat-discovery";
import { ensureLocalBridgeSharedSecret } from "./local-shared-secret";

const BRIDGE_ENVIRONMENT = fileURLToPath(new URL("../.env.local", import.meta.url));
const WORKER_ENVIRONMENT = fileURLToPath(new URL("../../../.dev.vars", import.meta.url));
const WORKER_TEMPLATE = fileURLToPath(new URL("../../../.dev.vars.example", import.meta.url));

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

    const dialogs = await client.getDialogs({ limit: undefined, ignoreMigrated: true });
    const chats = dialogs
      .map((dialog) => dialog.entity ? describeTelegramChat(dialog.entity) : null)
      .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat));
    const uniqueChats = [...new Map(chats.map((chat) => [chat.chatId, chat])).values()]
      .sort((left, right) => left.title.localeCompare(right.title, "hy"));

    stdout.write("\nTitle\tUsername\tChat ID\tType\tForum\n");
    for (const chat of uniqueChats) {
      stdout.write(`${chat.title}\t${chat.username ? `@${chat.username}` : "—"}\t${chat.chatId}\t${chat.type}\t${chat.forum ? "yes" : "no"}\n`);
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
  ) ? error.message : "Telegram chat discovery failed without changing the allowlist.";
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
