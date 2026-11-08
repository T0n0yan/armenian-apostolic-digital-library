import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_LETTER, parseLetter, parseRecipientInput } from "../app/utils/private-letter";

test("պահված արժեքը և ստացողի տողը ապահով են կարդացվում", () => {
  assert.deepEqual(parseLetter("not json"), EMPTY_LETTER);
  assert.deepEqual(parseLetter(JSON.stringify({ recipientIds: ["a", 5] })).recipientIds, ["a"]);
  assert.deepEqual(parseRecipientInput(" Anun@Gmail.com, @User  anun@gmail.com"), ["anun@gmail.com", "@user"]);
});
