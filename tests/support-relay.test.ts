import assert from "node:assert/strict";
import test from "node:test";

import { readerIdFrom, relayedText, relayHeader, SUPPORT_PROMPTS, supportHeader, supportKindFor } from "../app/utils/support-relay";

test("a relayed message carries the reader's id, and only that id is read back", () => {
  const header = supportHeader("support", { id: 123456789, first_name: "Արամ", username: "aram" });
  assert.equal(header, "🛠 Տեխնիկական · Արամ @aram · #u123456789");
  assert.equal(readerIdFrom(relayedText(header, "Աուդիոն չի բացվում", 4096)), 123456789);
  assert.equal(readerIdFrom("Սովորական հաղորդագրություն"), null);
  assert.equal(readerIdFrom(undefined), null);
  assert.equal(supportHeader("contact", { id: 7 }), "✉️ Հարց կամ առաջարկ · Անանուն · #u7");
});

test("the topic follows the prompt the reader answered; anything else is a question", () => {
  assert.equal(supportKindFor(SUPPORT_PROMPTS.support), "support");
  assert.equal(supportKindFor(SUPPORT_PROMPTS.contact), "contact");
  assert.equal(supportKindFor(undefined), "contact");
});

test("long messages are cut to Telegram's limit and keep the header", () => {
  const text = relayedText("#u1", "ա".repeat(5000), 4096);
  assert.equal(text.length, 4096);
  assert.equal(readerIdFrom(text), 1);
  assert.equal(relayedText("#u1", "", 1024), "#u1");
});

test("a sacred place sent with /place carries the reader's id too, so the team can answer", () => {
  const header = relayHeader("📍 Սրբավայր", { id: 42, first_name: "Անի" });
  assert.equal(header, "📍 Սրբավայր · Անի · #u42");
  assert.equal(readerIdFrom(header), 42);
});
