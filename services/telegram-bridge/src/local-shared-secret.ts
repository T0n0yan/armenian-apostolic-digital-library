import { randomBytes } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

import { assertLocalSecretFile, saveLocalEnvironmentValue } from "./authorization-env";

export type LocalSharedSecretFiles = {
  bridgeEnvironment: string;
  workerEnvironment: string;
  workerTemplate: string;
};

type SecretFactory = () => string;

async function ensureWorkerEnvironment(filePath: string, templatePath: string) {
  const metadata = await lstat(filePath).catch(() => null);
  if (metadata) {
    await assertLocalSecretFile(filePath);
    return;
  }
  const template = await readFile(templatePath, "utf8");
  await writeFile(filePath, template, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await assertLocalSecretFile(filePath);
}

export async function ensureLocalBridgeSharedSecret(
  files: LocalSharedSecretFiles,
  createSecret: SecretFactory = () => randomBytes(32).toString("base64url"),
) {
  await assertLocalSecretFile(files.bridgeEnvironment);
  const bridgeEnvironment = parseEnv(await readFile(files.bridgeEnvironment, "utf8"));
  const configured = bridgeEnvironment.TELEGRAM_BRIDGE_SHARED_SECRET?.trim() ?? "";
  const secret = configured || createSecret();
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(secret)) {
    throw new Error("The local TELEGRAM_BRIDGE_SHARED_SECRET is invalid.");
  }
  if (!configured) {
    await saveLocalEnvironmentValue(files.bridgeEnvironment, "TELEGRAM_BRIDGE_SHARED_SECRET", secret);
  }
  await ensureWorkerEnvironment(files.workerEnvironment, files.workerTemplate);
  await saveLocalEnvironmentValue(files.workerEnvironment, "TELEGRAM_BRIDGE_SHARED_SECRET", secret);
  return { bridgeConfigured: true, workerConfigured: true, generated: !configured } as const;
}
