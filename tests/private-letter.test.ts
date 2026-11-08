import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_LETTER, letterVisibleTo, parseLetter, parseRecipientInput, yerevanDay } from "../app/utils/private-letter";

const letter = { ...EMPTY_LETTER, recipientIds: ["google:1", "telegram:2"], body: "Բարև", visibleFrom: "2026-11-09" };

test("նամակը երևում է միայն ստացողին և միայն նշված օրից", () => {
  assert.equal(letterVisibleTo(letter, "google:1", "2026-11-09"), true);
  assert.equal(letterVisibleTo(letter, "telegram:2", "2026-11-10"), true);
  assert.equal(letterVisibleTo(letter, "google:1", "2026-11-08"), false);
  assert.equal(letterVisibleTo(letter, "google:3", "2026-11-09"), false);
  assert.equal(letterVisibleTo(letter, null, "2026-11-09"), false);
  assert.equal(letterVisibleTo({ ...letter, body: "  " }, "google:1", "2026-11-09"), false);
  assert.equal(letterVisibleTo({ ...letter, visibleFrom: "" }, "google:1", "2000-01-01"), true);
});

test("պահված արժեքը և ստացողի տողը ապահով են կարդացվում", () => {
  assert.deepEqual(parseLetter("not json"), EMPTY_LETTER);
  assert.equal(parseLetter(JSON.stringify({ ...letter, visibleFrom: "վաղը" })).visibleFrom, "");
  assert.deepEqual(parseLetter(JSON.stringify({ recipientIds: ["a", 5] })).recipientIds, ["a"]);
  assert.deepEqual(parseRecipientInput(" Anun@Gmail.com, @User  anun@gmail.com"), ["anun@gmail.com", "@user"]);
  assert.equal(yerevanDay(Date.parse("2026-11-08T20:30:00Z")), "2026-11-09");
});
