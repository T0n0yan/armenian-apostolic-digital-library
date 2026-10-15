import { chmod, lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type TelegramAuthorizationCredentials = {
  apiId: number;
  apiHash: string;
};

export type TelegramSessionCredentials = TelegramAuthorizationCredentials & {
  session: string;
};

export function readTelegramAuthorizationCredentials(
  environment: NodeJS.ProcessEnv,
): TelegramAuthorizationCredentials {
  const apiIdValue = environment.TELEGRAM_API_ID?.trim() ?? "";
  const apiHash = environment.TELEGRAM_API_HASH?.trim() ?? "";
  if (!/^\d{1,10}$/u.test(apiIdValue)) {
    throw new Error("TELEGRAM_API_ID is missing or invalid in the local Bridge environment file.");
  }
  const apiId = Number(apiIdValue);
  if (!Number.isSafeInteger(apiId) || apiId <= 0) {
    throw new Error("TELEGRAM_API_ID is missing or invalid in the local Bridge environment file.");
  }
  if (!/^[a-fA-F0-9]{32}$/u.test(apiHash)) {
    throw new Error("TELEGRAM_API_HASH is missing or invalid in the local Bridge environment file.");
  }
  return { apiId, apiHash };
}

export function hasTelegramSession(environment: NodeJS.ProcessEnv) {
  return Boolean(environment.TELEGRAM_SESSION?.trim());
}

export function readTelegramSessionCredentials(environment: NodeJS.ProcessEnv): TelegramSessionCredentials {
  const credentials = readTelegramAuthorizationCredentials(environment);
  const session = environment.TELEGRAM_SESSION?.trim() ?? "";
  if (session.length < 16 || session.length > 16_384 || /[\u0000-\u001F\u007F]/u.test(session)) {
    throw new Error("TELEGRAM_SESSION is missing or invalid in the local Bridge environment file.");
  }
  return { ...credentials, session };
}

export function withLocalEnvironmentValue(source: string, key: string, value: string) {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(key) || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new Error("Invalid local environment value.");
  }
  const assignment = `${key}=${JSON.stringify(value)}`;
  const matcher = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, "u");
  const output: string[] = [];
  let replaced = false;
  for (const line of source.replace(/\r\n?/gu, "\n").split("\n")) {
    if (matcher.test(line)) {
      if (!replaced) output.push(assignment);
      replaced = true;
    } else {
      output.push(line);
    }
  }
  while (output.at(-1) === "") output.pop();
  if (!replaced) output.push(assignment);
  return `${output.join("\n")}\n`;
}

export function withTelegramSession(source: string, session: string) {
  if (
    session.length < 16
    || session.length > 16_384
    || /[\u0000-\u001F\u007F]/u.test(session)
  ) {
    throw new Error("GramJS returned an invalid session value.");
  }
  return withLocalEnvironmentValue(source, "TELEGRAM_SESSION", session);
}

export async function assertLocalSecretFile(filePath: string) {
  const metadata = await lstat(filePath).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error("The local Bridge environment file is missing or is not a regular file.");
  }
  await chmod(filePath, 0o600);
}

export async function saveLocalEnvironmentValue(filePath: string, key: string, value: string) {
  await assertLocalSecretFile(filePath);
  const current = await readFile(filePath, "utf8");
  const next = withLocalEnvironmentValue(current, key, value);
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, next, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function saveTelegramSession(filePath: string, session: string) {
  if (
    session.length < 16
    || session.length > 16_384
    || /[\u0000-\u001F\u007F]/u.test(session)
  ) {
    throw new Error("GramJS returned an invalid session value.");
  }
  return saveLocalEnvironmentValue(filePath, "TELEGRAM_SESSION", session);
}
