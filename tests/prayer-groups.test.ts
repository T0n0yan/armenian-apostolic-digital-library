import assert from "node:assert/strict";
import test from "node:test";

import { prayerGroupOf } from "../app/utils/prayer-groups";

test("prayers fall into groups by title, in classical spelling too", () => {
  assert.equal(prayerGroupOf({ title: "​ԱՌԱՎՕՏԵԱՆ ՄԱՂԹԱՆՔ Ա" }), "morning");
  assert.equal(prayerGroupOf({ title: "ԱՌԱՒՕՏԵԱՆ ՄԱՂԹԱՆՔ Բ" }), "morning");
  assert.equal(prayerGroupOf({ title: "Գ. ԳԻՇԵՐԱՅԻՆ ԵՒ ԱՌԱՒՕՏԵԱՆ ԺԱՄԵՐԳՈՒԹԻՒՆՆԵՐ" }), "hours");
  assert.equal(prayerGroupOf({ title: "ՃԱՇՈՒ 3-ՐԴ ԺԱՄ" }), "hours");
  assert.equal(prayerGroupOf({ title: "ԵՐԵԿՈՅԱՆ ԱՂՈԹՔ" }), "evening");
  assert.equal(prayerGroupOf({ title: "​ՊԱՀՊԱՆՈՒԹԵԱՆ ԱՂՕԹՔ" }), "daily");
  assert.equal(prayerGroupOf({ title: "ՍԲ. ՀԱՂՈՐԴՈՒԹԻՒՆ ՍՏԱՆԱԼՈՒՑ ԱՌԱՋ ԵՒ ՅԵՏՈՅ" }), "communion");
  assert.equal(prayerGroupOf({ title: "Աղոթք ընտանիքի" }), "others");
  assert.equal(prayerGroupOf({ title: "Ննջեցյալների համար" }), "others");
  assert.equal(prayerGroupOf({ title: "ԱՂՈԹՔ Բ", excerpt: "Խաղաղութեամբ Քո, Հոգի՛դ Սուրբ" }), "more");
});
