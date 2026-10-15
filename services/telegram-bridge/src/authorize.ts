import { stdin, stdout } from "node:process";
import { loadEnvFile } from "node:process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

import { TelegramClient } from "telegram";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";

import {
  assertLocalSecretFile,
  hasTelegramSession,
  readTelegramAuthorizationCredentials,
  saveTelegramSession,
} from "./authorization-env";

const LOCAL_ENV_FILE = fileURLToPath(new URL("../.env.local", import.meta.url));

class AuthorizationCancelledError extends Error {}
class ExistingAccountRequiredError extends Error {}

function promptLine(label: string, hidden: boolean): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Telegram authorization requires an interactive local terminal.");
  }
  return new Promise((resolve, reject) => {
    const wasRaw = stdin.isRaw;
    const decoder = new StringDecoder("utf8");
    let value = "";
    let finished = false;
    const cleanup = () => {
      stdin.off("data", onData);
      if (!wasRaw) stdin.setRawMode(false);
      stdin.pause();
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") {
          finish(new AuthorizationCancelledError("Authorization cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007F" || character === "\b") {
          const characters = Array.from(value);
          if (characters.length > 0) {
            characters.pop();
            value = characters.join("");
            if (!hidden) stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          if (!hidden) stdout.write(character);
        }
      }
    };
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function promptUntil(label: string, valid: (value: string) => boolean) {
  while (true) {
    const value = await promptLine(label, true);
    if (valid(value)) return value;
    stdout.write("Invalid value. Please try again.\n");
  }
}

async function authorize() {
  if (process.argv.length > 2) {
    throw new Error("This command does not accept command-line arguments.");
  }
  await assertLocalSecretFile(LOCAL_ENV_FILE);
  loadEnvFile(LOCAL_ENV_FILE);
  const credentials = readTelegramAuthorizationCredentials(process.env);

  stdout.write("This command creates a Telegram user session locally and contacts only Telegram API.\n");
  stdout.write("Phone, login code, 2FA password, API hash and session are never printed.\n");
  if (hasTelegramSession(process.env)) {
    const confirmation = await promptLine("Replace the existing local TELEGRAM_SESSION? [y/N]: ", false);
    if (confirmation.trim().toLocaleLowerCase("en-US") !== "y") {
      throw new AuthorizationCancelledError("Authorization cancelled.");
    }
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, credentials.apiId, credentials.apiHash, {
    connectionRetries: 5,
    autoReconnect: false,
    baseLogger: new Logger(LogLevel.NONE),
  });
  client.setLogLevel(LogLevel.NONE);
  let rejectedSteps = 0;
  try {
    await client.start({
      phoneNumber: () => promptUntil("Telegram account phone number (international format): ", (value) => /^\+\d{7,15}$/u.test(value)),
      phoneCode: () => promptUntil("Telegram login code: ", (value) => /^\d{4,8}$/u.test(value)),
      password: () => promptUntil("Telegram 2FA password: ", (value) => value.length > 0),
      firstAndLastNames: async () => { throw new ExistingAccountRequiredError("Account creation is disabled."); },
      onError: async (error) => {
        if (error instanceof ExistingAccountRequiredError) {
          stdout.write("This phone number requires account creation; the authorization command stopped.\n");
          return true;
        }
        rejectedSteps += 1;
        stdout.write("Telegram rejected the authorization step. Please try again.\n");
        return rejectedSteps >= 3;
      },
    });
    if (!(await client.checkAuthorization())) throw new Error("Telegram authorization was not completed.");
    await saveTelegramSession(LOCAL_ENV_FILE, session.save());
    stdout.write("TELEGRAM_SESSION saved locally in services/telegram-bridge/.env.local\n");
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

authorize().catch((error: unknown) => {
  const safeMessage = error instanceof AuthorizationCancelledError
    ? error.message
    : error instanceof Error && (
      error.message.startsWith("TELEGRAM_API_")
      || error.message.startsWith("The local Bridge environment")
      || error.message.startsWith("This command")
      || error.message.startsWith("Telegram authorization requires")
    )
      ? error.message
      : "Telegram authorization did not complete. No session was saved.";
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
