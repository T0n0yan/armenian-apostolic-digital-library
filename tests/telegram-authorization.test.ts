import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";

import {
  readTelegramAuthorizationCredentials,
  saveTelegramSession,
  withTelegramSession,
} from "../services/telegram-bridge/src/authorization-env";
import { ensureLocalBridgeSharedSecret } from "../services/telegram-bridge/src/local-shared-secret";

const FIXTURE_HASH = "0123456789abcdef0123456789abcdef";
const FIXTURE_SESSION = "fixture_string_session_value_1234567890";

test("authorization credentials require MTProto API credentials and never accept a bot token as a substitute", () => {
  assert.throws(
    () => readTelegramAuthorizationCredentials({ TELEGRAM_BOT_TOKEN: "000000000:fixture-token-not-a-secret" }),
    /TELEGRAM_API_ID/u,
  );
  assert.deepEqual(
    readTelegramAuthorizationCredentials({ TELEGRAM_API_ID: "12345", TELEGRAM_API_HASH: FIXTURE_HASH }),
    { apiId: 12345, apiHash: FIXTURE_HASH },
  );
  assert.throws(
    () => readTelegramAuthorizationCredentials({ TELEGRAM_API_ID: "12345", TELEGRAM_API_HASH: "not-a-hash" }),
    /TELEGRAM_API_HASH/u,
  );
});

test("session serialization replaces duplicates without exposing it as a command argument", () => {
  const result = withTelegramSession(
    "TELEGRAM_API_ID=12345\nTELEGRAM_SESSION=old\nTELEGRAM_SESSION=duplicate\n",
    FIXTURE_SESSION,
  );
  assert.equal((result.match(/^TELEGRAM_SESSION=/gmu) ?? []).length, 1);
  assert.match(result, new RegExp(FIXTURE_SESSION, "u"));
  assert.throws(() => withTelegramSession("", "value\nwith-newline"), /invalid session/u);
});

test("session is written atomically to a regular local file with owner-only permissions", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "telegram-authorization-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const environmentFile = join(directory, ".env.local");
  await writeFile(environmentFile, `TELEGRAM_API_ID=12345\nTELEGRAM_API_HASH=${FIXTURE_HASH}\n`, { mode: 0o644 });
  await saveTelegramSession(environmentFile, FIXTURE_SESSION);
  const contents = await readFile(environmentFile, "utf8");
  assert.equal(parseEnv(contents).TELEGRAM_SESSION, FIXTURE_SESSION);
  if (process.platform !== "win32") assert.equal((await stat(environmentFile)).mode & 0o777, 0o600);
});

test("one generated local Bridge secret is stored in both ignored-style environment files", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "telegram-shared-secret-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bridgeEnvironment = join(directory, ".env.local");
  const workerEnvironment = join(directory, ".dev.vars");
  const workerTemplate = join(directory, ".dev.vars.example");
  const fixtureSecret = "fixture_shared_secret_00000000000000000000";
  await writeFile(bridgeEnvironment, "TELEGRAM_BRIDGE_SHARED_SECRET=\n", { mode: 0o600 });
  await writeFile(workerTemplate, "TELEGRAM_BOT_TOKEN=\nTELEGRAM_BRIDGE_SHARED_SECRET=\n");
  const status = await ensureLocalBridgeSharedSecret(
    { bridgeEnvironment, workerEnvironment, workerTemplate },
    () => fixtureSecret,
  );
  assert.deepEqual(status, { bridgeConfigured: true, workerConfigured: true, generated: true });
  assert.equal(parseEnv(await readFile(bridgeEnvironment, "utf8")).TELEGRAM_BRIDGE_SHARED_SECRET, fixtureSecret);
  assert.equal(parseEnv(await readFile(workerEnvironment, "utf8")).TELEGRAM_BRIDGE_SHARED_SECRET, fixtureSecret);
  if (process.platform !== "win32") assert.equal((await stat(workerEnvironment)).mode & 0o777, 0o600);
});
