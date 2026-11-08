import assert from "node:assert/strict";
import test from "node:test";

import { errorFingerprint, parseClientError } from "../app/data/client-errors.server";

test("բրաուզերի սխալը մաքրվում է. query չի պահվում, անհայտ հարթակը դատարկ է", () => {
  const report = parseClientError({ message: "x is undefined", source: "https://apostolic.am/assets/a-AbCdEf12.js?v=1:3:9", stack: "at f", path: "/search?q=գաղտնի", platform: "windows-phone" });
  assert.ok(report);
  assert.equal(report.path, "/search");
  assert.equal(report.source, "https://apostolic.am/assets/a-AbCdEf12.js");
  assert.equal(report.platform, "");
  assert.equal(parseClientError({ message: "" }), null);
  assert.equal(parseClientError("text"), null);
  assert.equal(parseClientError({ message: "a".repeat(1000) })?.message.length, 300);
});

test("նույն սխալը տարբեր թվերով և build-ով՝ մեկ fingerprint", async () => {
  const base = { stack: "", path: "/", platform: "" };
  const first = await errorFingerprint({ ...base, message: "Item 12 missing", source: "https://apostolic.am/assets/root-AAAAAAAA.js" });
  const second = await errorFingerprint({ ...base, message: "Item 7 missing", source: "https://apostolic.am/assets/root-BBBBBBBB.js" });
  const other = await errorFingerprint({ ...base, message: "Other", source: "" });
  assert.equal(first, second);
  assert.notEqual(first, other);
});
