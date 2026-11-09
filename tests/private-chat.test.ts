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
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "settings", nick: " Ա\nնի ", font: 18 })), { type: "settings", nick: "Ա նի", font: 18, bgOpacity: 0.22, notifyPresence: true });
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "edit", id: 4, text: " նոր " })), { type: "edit", id: 4, text: "նոր" });
  assert.equal(parseClientEvent(JSON.stringify({ type: "edit", id: 4, text: " " })), null);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "where", where: "x", visible: true })), { type: "where", where: "app", visible: true });
  assert.equal(cleanMessage("ա".repeat(20_000)).length, 20_000);
});

import { clampOpacity } from "../app/utils/private-chat";

test("ֆոն. միայն նկարներ, թափանցիկությունը սահմաններում", () => {
  assert.equal(allowedMime("background", "image/png"), "image/png");
  assert.equal(allowedMime("background", "image/svg+xml"), null);
  assert.equal(allowedMime("background", "audio/webm"), null);
  assert.equal(clampOpacity(2), 0.8);
  assert.equal(clampOpacity(-1), 0.05);
  assert.equal(clampOpacity("x"), 0.22);
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "settings", nick: "", font: 15, bgOpacity: 0.3 })), { type: "settings", nick: "", font: 15, bgOpacity: 0.3, notifyPresence: true });
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "background-reset" })), { type: "background-reset" });
});

test("պատասխան (reply). միայն թիվ, սխալը՝ առանց պատասխանի", () => {
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "send", text: "այո", clientId: "c", replyTo: 7 })), { type: "send", text: "այո", clientId: "c", replyTo: 7 });
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "send", text: "այո", clientId: "c", replyTo: "7" })), { type: "send", text: "այո", clientId: "c" });
  assert.deepEqual(parseClientEvent(JSON.stringify({ type: "send", text: "այո", clientId: "c", replyTo: -1 })), { type: "send", text: "այո", clientId: "c" });
});

import { PRESENCE_AWAY_MIN_MS, PRESENCE_NOTIFY_EVERY_MS, shouldNotifyPresence } from "../app/utils/private-chat";

test("«Նա կայքում է» ծանուցումը. միայն փակից, երկար բացակայությունից հետո, ոչ հաճախ", () => {
  const now = 10_000_000;
  assert.equal(shouldNotifyPresence("away", "app", now - PRESENCE_AWAY_MIN_MS - 1, null, now), true);
  assert.equal(shouldNotifyPresence("away", "chat", null, null, now), true);
  assert.equal(shouldNotifyPresence("app", "chat", null, null, now), false);
  assert.equal(shouldNotifyPresence("away", "away", null, null, now), false);
  // կարճ վերամիացում (էջի թարմացում)՝ ոչ
  assert.equal(shouldNotifyPresence("away", "app", now - 10_000, null, now), false);
  // 20 րոպեից շուտ՝ ոչ
  assert.equal(shouldNotifyPresence("away", "app", null, now - PRESENCE_NOTIFY_EVERY_MS + 1, now), false);
  assert.equal(shouldNotifyPresence("away", "app", null, now - PRESENCE_NOTIFY_EVERY_MS, now), true);
});

test("առաջին մուտքը (վիճակ դեռ չկա) նույնպես ծանուցում է", () => {
  assert.equal(shouldNotifyPresence(null, "app", null, null, 10_000_000), true);
  assert.equal(shouldNotifyPresence(null, "away", null, null, 10_000_000), false);
});
