import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { NOT_MOVED, USER_TABLES } from "../app/data/account-links.server";

// Ամեն աղյուսակ user_id սյունակով կամ տեղափոխվում է Google↔Telegram միացնելիս, կամ բացատրված է, թե ինչու ոչ։
test("Google↔Telegram միացում. ոչ մի անձնական աղյուսակ մոռացված չէ", () => {
  const sql = readdirSync("migrations").filter((file) => file.endsWith(".sql")).map((file) => readFileSync(`migrations/${file}`, "utf8")).join("\n");
  const withUser = new Set<string>();
  for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g)) if (/\buser_id\b/.test(match[2])) withUser.add(match[1]);
  for (const match of sql.matchAll(/ALTER TABLE (\w+) ADD COLUMN user_id\b/g)) withUser.add(match[1]);
  const missing = [...withUser].filter((table) => !USER_TABLES.includes(table) && !(table in NOT_MOVED));
  assert.deepEqual(missing, [], `Ավելացրեք USER_TABLES-ում կամ NOT_MOVED-ում՝ ${missing.join(", ")}`);
});
