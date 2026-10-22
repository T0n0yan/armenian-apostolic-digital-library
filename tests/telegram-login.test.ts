import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { validateTelegramLoginData } from "../app/auth/telegram-login";

const TOKEN = "123456:fixture-token-not-a-secret";

function signed(fields: Record<string, string | number>) {
  const check = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join("\n");
  const hash = createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(check).digest("hex");
  return { ...fields, hash };
}

test("Telegram Login results are accepted only with the bot's signature and while fresh", async () => {
  const now = 1_800_000_000;
  const data = signed({ id: 42, first_name: "Արամ", username: "aram", auth_date: now - 60 });
  assert.deepEqual(await validateTelegramLoginData(data, TOKEN, now), { id: "telegram:42", telegramId: "42", displayName: "Արամ", username: "aram" });
  assert.equal(await validateTelegramLoginData({ ...data, first_name: "Ուրիշ" }, TOKEN, now), null);
  assert.equal(await validateTelegramLoginData(data, "999:other", now), null);
  assert.equal(await validateTelegramLoginData(signed({ id: 42, first_name: "Արամ", auth_date: now - 90_000 }), TOKEN, now), null);
});
