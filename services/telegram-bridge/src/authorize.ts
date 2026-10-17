import { spawn } from "node:child_process";
import { once } from "node:events";
import { stdin, stdout } from "node:process";
import { loadEnvFile } from "node:process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

import { Logger, LogLevel, StringSession, TelegramClient } from "./telegram-client";

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

/**
 * Stores a new session straight in the GitHub repository's Actions secrets via `gh`, without
 * printing it or writing it to disk. The hourly sync then has its own session, separate from the
 * one on this Mac.
 */
async function saveSessionToGitHub(session: string) {
  const child = spawn("gh", ["secret", "set", "TELEGRAM_SESSION"], { stdio: ["pipe", "ignore", "inherit"] });
  child.stdin.end(session);
  const [code] = await once(child, "exit") as [number | null];
  if (code !== 0) throw new Error("Saving TELEGRAM_SESSION to GitHub failed. Check `gh auth status`.");
}

async function authorize() {
  const toGitHub = process.argv[2] === "--github-secret";
  if (process.argv.length > (toGitHub ? 3 : 2)) {
    throw new Error("Usage: telegram:authorize [--github-secret]");
  }
  await assertLocalSecretFile(LOCAL_ENV_FILE);
  loadEnvFile(LOCAL_ENV_FILE);
  const credentials = readTelegramAuthorizationCredentials(process.env);

  stdout.write("This command creates a Telegram user session locally and contacts only Telegram API.\n");
  stdout.write("Phone, login code, 2FA password, API hash and session are never printed.\n");
  if (!toGitHub && hasTelegramSession(process.env)) {
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
    if (toGitHub) {
      await saveSessionToGitHub(session.save());
      stdout.write("A new TELEGRAM_SESSION was saved as a GitHub Actions secret (not on this Mac).\n");
    } else {
      await saveTelegramSession(LOCAL_ENV_FILE, session.save());
      stdout.write("TELEGRAM_SESSION saved locally in services/telegram-bridge/.env.local\n");
    }
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
