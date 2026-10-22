const encoder = new TextEncoder();
const MAX_AGE_SECONDS = 60 * 60 * 24;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/**
 * The Telegram Login (oauth.telegram.org) result, checked with the bot token as Telegram describes:
 * HMAC-SHA256 of the sorted "key=value" lines, keyed with SHA-256 of the token; at most a day old.
 * Returns the reader as the Mini App knows them ("telegram:<id>"), or null.
 */
export async function validateTelegramLoginData(data: Record<string, unknown>, botToken: string, now = Math.floor(Date.now() / 1000)) {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!/^[a-z_]{1,20}$/u.test(key) || (typeof value !== "string" && typeof value !== "number")) continue;
    fields[key] = String(value);
  }
  const receivedHash = fields.hash?.toLowerCase();
  const authDate = Number(fields.auth_date);
  if (!receivedHash || !/^[a-f0-9]{64}$/u.test(receivedHash) || !/^\d{1,20}$/u.test(fields.id ?? "")) return null;
  if (!Number.isInteger(authDate) || authDate > now + 300 || now - authDate > MAX_AGE_SECONDS) return null;
  const dataCheckString = Object.keys(fields).filter((key) => key !== "hash").sort().map((key) => `${key}=${fields[key]}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const calculatedHash = toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(dataCheckString))));
  if (!constantTimeEqual(receivedHash, calculatedHash)) return null;
  const displayName = [fields.first_name, fields.last_name].filter((part) => part?.trim()).join(" ").trim().slice(0, 160)
    || (fields.username ? `@${fields.username}` : "");
  if (!displayName) return null;
  return { id: `telegram:${fields.id}`, telegramId: fields.id, displayName, username: fields.username?.trim().slice(0, 64) || null };
}
