import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import test from "node:test";

import { encryptPayload } from "../app/data/web-push.server";

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

test("Web Push payloads decrypt as a browser would (RFC 8291, aes128gcm)", async () => {
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  const auth = randomBytes(16);
  const message = { title: "🔔 Ժամանակն է կարդալու", body: "Ննջեցյալների համար" };
  const body = Buffer.from(await encryptPayload(
    { endpoint: "https://push.example/x", p256dh: browser.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    new TextEncoder().encode(JSON.stringify(message)) as Uint8Array<ArrayBuffer>,
  ));

  const salt = body.subarray(0, 16);
  const keyLength = body[20];
  const serverPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);
  const shared = browser.computeSecret(serverPublic);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), browser.getPublicKey(), serverPublic]), 32);
  const key = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2);
  assert.deepEqual(JSON.parse(plain.subarray(0, -1).toString("utf8")), message);
});
