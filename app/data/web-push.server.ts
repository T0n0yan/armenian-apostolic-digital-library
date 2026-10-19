/**
 * Web Push from a Worker with WebCrypto only: VAPID (RFC 8292) for authorization and aes128gcm
 * payload encryption (RFC 8291 / RFC 8188).
 */

// A P-256 private key in JWK form (kept loose so tests type-check outside the Worker's DOM types).
type PrivateJwk = Record<string, string | undefined>;
type Key = Awaited<ReturnType<typeof crypto.subtle.generateKey>> extends infer K ? K extends { privateKey: infer P } ? P : K : never;
export type PushKeys = { publicKey: string; privateJwk: PrivateJwk; subject: string };
export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

const encoder = new TextEncoder();
const encode = (value: string) => encoder.encode(value) as Bytes;

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Bytes {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

type Bytes = Uint8Array<ArrayBuffer>;

function concat(...parts: Uint8Array[]): Bytes {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

/** HKDF with a single output block (enough for every length used here, at most 32 bytes). */
async function hkdf(salt: Bytes, inputKey: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmac(salt, inputKey);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** VAPID authorization header: an ES256 JWT for the push service's origin. */
async function vapidHeader(endpoint: string, keys: PushKeys) {
  const header = base64UrlEncode(encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: keys.subject,
  })));
  const signingKey = await (crypto.subtle.importKey as (format: "jwk", key: object, algorithm: object, extractable: boolean, usages: string[]) => Promise<Key>)("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

/** Encrypts a payload for one subscription (aes128gcm, a single record). */
export async function encryptPayload(subscription: PushSubscriptionRow, payload: Bytes) {
  const clientPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as { publicKey: Key; privateKey: Key };
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey) as ArrayBuffer);
  const clientKey = await crypto.subtle.importKey("raw", clientPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256));

  const keyInfo = concat(encode("WebPush: info\0"), clientPublic, serverPublic);
  const inputKey = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, inputKey, encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, inputKey, encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  // The last record ends with the 0x02 delimiter.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))));
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

/**
 * Sends a notification to one browser. Returns "gone" when the subscription no longer exists
 * (the reader turned notifications off or cleared the site), so it can be removed.
 */
export async function sendWebPush(subscription: PushSubscriptionRow, message: unknown, keys: PushKeys): Promise<"sent" | "gone" | "failed"> {
  const body = await encryptPayload(subscription, encode(JSON.stringify(message)));
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(subscription.endpoint, keys),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(6 * 3600),
      urgency: "high",
    },
    body,
  }).catch(() => null);
  if (!response) return "failed";
  if (response.status === 404 || response.status === 410) return "gone";
  return response.ok ? "sent" : "failed";
}

export function pushKeysFrom(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string }): PushKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return null;
  try {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) as PrivateJwk, subject: env.VAPID_SUBJECT || "mailto:admin@example.com" };
  } catch {
    return null;
  }
}
