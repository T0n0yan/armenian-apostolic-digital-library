import assert from "node:assert/strict";
import test from "node:test";
import { remember } from "../app/data/memory-cache.server";
import { contentVersion } from "../app/data/content-version.server";
import { bumpCacheEpoch, cacheEpoch } from "../app/data/site-refresh.server";

function fixture(epoch = "0") {
  let reads = 0;
  const db = { prepare: (sql: string) => ({
    first: async () => { reads++; await new Promise(resolve => setTimeout(resolve, 5)); return sql.includes("MAX") ? { updated: "2026-11-11T00:00:00Z" } : { value: epoch }; },
    bind: (value: string) => ({ run: async () => { epoch = value; } }),
  }) } as unknown as D1Database;
  return { db, reads: () => reads };
}

test("միաժամանակյա հանրային ընթերցումները կատարում են մեկ բեռնում և մեկ epoch հարցում", async () => {
  const f = fixture(); let loads = 0;
  const load = async () => { loads++; await new Promise(resolve => setTimeout(resolve, 5)); return "public"; };
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => remember(f.db, "page", 1000, load))), Array(20).fill("public"));
  assert.equal(loads, 1); assert.equal(f.reads(), 1);
  await remember(f.db, "page", 1000, load); assert.equal(loads, 1);
  await bumpCacheEpoch(f.db);
  await remember(f.db, "page", 1000, load); assert.equal(loads, 2);
});

test("տարբեր բազաների նույն cache բանալիները իրար չեն խառնվում, սխալը չի պահպանվում", async () => {
  const a = fixture(), b = fixture();
  assert.equal(await remember(a.db, "same", 1000, async () => "A"), "A");
  assert.equal(await remember(b.db, "same", 1000, async () => "B"), "B");
  await assert.rejects(remember(a.db, "failed", 1000, async () => { throw new Error("temporary"); }));
  assert.equal(await remember(a.db, "failed", 1000, async () => "recovered"), "recovered");
});

test("բովանդակության տարբերակի 20 միաժամանակյա հարցումը կատարում է երկու SQL ընթերցում", async () => {
  const f = fixture();
  const versions = await Promise.all(Array.from({ length: 20 }, () => contentVersion(f.db)));
  assert.equal(new Set(versions).size, 1); assert.equal(f.reads(), 2);
});

test("ուշացած epoch ընթերցումը չի վերագրում ադմինի թարմացումը", async () => {
  let resolveRead!: (value: { value: string }) => void;
  const db = { prepare: () => ({ first: () => new Promise(resolve => { resolveRead = resolve; }), bind: () => ({ run: async () => undefined }) }) } as unknown as D1Database;
  const pending = cacheEpoch(db);
  const next = await bumpCacheEpoch(db);
  resolveRead({ value: "old" });
  assert.equal(await pending, next);
  assert.equal(await cacheEpoch(db), next);
});
