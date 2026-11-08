import assert from "node:assert/strict";
import { test } from "node:test";

import { MESSAGE_MAX, cleanMessage, messageTicks, otherSide, parseClientEvent, unreadCount } from "../app/utils/private-chat";

test("բրաուզերից եկածը ընդունվում է միայն սպասվող ձևով", () => {
  assert.equal(parseClientEvent("not json"), null);
  assert.equal(parseClientEvent(JSON.stringify({ type: "admin" })), null);
  assert.equal(parseClientEvent(JSON.stringify({ type: "send", text: "   " })), null);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "send", text: " Բարև ", clientId: "x" })), { type: "send", text: "Բարև", clientId: "x" });
  assert.equal(parseClientEvent(JSON.stringify({ type: "read", upTo: -1 })), null);
  assert.equal(parseClientEvent(JSON.stringify({ type: "delete", id: "1" })), null);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "delete", id: 3 })), { type: "delete", id: 3 });
  // Կողմը բրաուզերը չի կարող նշել. այն միայն սերվերն է որոշում։
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "send", text: "x", side: "a" })), { type: "send", text: "x", clientId: "" });
});

test("տեքստը մաքրվում և կարճացվում է", () => {
  assert.equal(cleanMessage("a\r\nb\u0000"), "a\nb");
  assert.equal(cleanMessage("x".repeat(MESSAGE_MAX + 10)).length, MESSAGE_MAX);
  assert.equal(cleanMessage(5), "");
});

test("✓✓ և չկարդացվածներ", () => {
  assert.equal(otherSide("a"), "b");
  assert.equal(messageTicks({ id: 5 }, 5), "read");
  assert.equal(messageTicks({ id: 6 }, 5), "sent");
  const messages = [1, 2, 3].map((id) => ({ id, side: id === 2 ? "a" as const : "b" as const, body: "x", at: 0, deleted: id === 3 }));
  assert.equal(unreadCount(messages, "a", 0), 1);
  assert.equal(unreadCount(messages, "b", 0), 1);
});

import { allowedMime, clampFont, statusOf, FONT_MAX, FONT_MIN } from "../app/utils/private-chat";

test("լույսը. չատում → կայքում → փակ", () => {
  assert.equal(statusOf([]), "away");
  assert.equal(statusOf([{ where: "app", visible: false }]), "away");
  assert.equal(statusOf([{ where: "app", visible: true }]), "app");
  assert.equal(statusOf([{ where: "app", visible: true }, { where: "chat", visible: true }]), "chat");
  assert.equal(statusOf([{ where: "chat", visible: false }, { where: "app", visible: true }]), "app");
});

test("ֆայլերի ձևաչափ, կարգավորումներ, փոփոխում", () => {
  assert.equal(allowedMime("image", "image/jpeg"), "image/jpeg");
  assert.equal(allowedMime("image", "image/svg+xml"), null);
  assert.equal(allowedMime("audio", "audio/webm;codecs=opus"), "audio/webm");
  assert.equal(allowedMime("audio", "text/html"), null);
  assert.equal(allowedMime("video", "video/mp4"), null);
  assert.equal(clampFont(100), FONT_MAX);
  assert.equal(clampFont(1), FONT_MIN);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "settings", nick: " Ա\nնի ", font: 18 })), { type: "settings", nick: "Ա նի", font: 18 });
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "edit", id: 4, text: " նոր " })), { type: "edit", id: 4, text: "նոր" });
  assert.equal(parseClientEvent(JSON.stringify({ type: "edit", id: 4, text: " " })), null);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "where", where: "x", visible: true })), { type: "where", where: "app", visible: true });
  assert.equal(cleanMessage("ա".repeat(20_000)).length, 20_000);
});
