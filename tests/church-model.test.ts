import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { computeHotspots, liturgyTour, validateModel } from "../app/church3d/model";
import { BLOCK_TEMPLATES, TEMPLATES } from "../app/church3d/templates";
import { compileModel, validateAnyModel, type ChurchModelV2 } from "../app/church3d/blocks";
import { getModelRecord, getPublishedModel, publishDraft, restoreVersion, saveDraft } from "../app/data/church-models.server";

test("բոլոր ձևանմուշները անցնում են ստուգումը և ունեն կետեր ու «Պատարագից առաջ»", () => {
  for (const template of TEMPLATES) {
    const { model, errors } = validateModel(JSON.parse(JSON.stringify(template)));
    assert.deepEqual(errors, [], template.id);
    assert.ok(model);
    const kinds = new Set(computeHotspots(template).map((spot) => spot.kind));
    for (const kind of ["khoran", "bem", "seghan", "avandatun", "nav"]) assert.ok(kinds.has(kind as never), `${template.id}: ${kind}`);
    assert.equal(liturgyTour(template).length, 6, template.id);
  }
});

test("սխալ անձնագիրը մերժվում է՝ սխալի տեղով", () => {
  assert.deepEqual(validateModel(null).model, null);
  const broken = JSON.parse(JSON.stringify(TEMPLATES[0]));
  broken.rooms[0].height = "բարձր";
  broken.items.push({ type: "rocket", at: [0, 0] });
  const { model, errors } = validateModel(broken);
  assert.equal(model, null);
  assert.ok(errors.some((e) => e.startsWith("rooms[0].height")));
  assert.ok(errors.some((e) => e.includes(".type")));
});

test("բլոկներ (v2). ձևանմուշները ստուգվում են, ներսն ու դուրսը համընկնում են", () => {
  for (const template of BLOCK_TEMPLATES) {
    const { model, shape, errors } = validateAnyModel(JSON.parse(JSON.stringify(template)));
    assert.deepEqual(errors, [], template.id);
    assert.ok(model && shape);
    assert.equal(shape.version, 1);
  }
  const cross = compileModel(BLOCK_TEMPLATES[0]).model;
  // Խորանը նավի արևելյան պատի մեջ է (կոր պատ), գմբեթը կենտրոնում՝ առագաստներով, թմբուկը սկսվում է տանիքից։
  const main = cross.rooms.find((room) => room.id === "main")!;
  assert.deepEqual(main.apses, [{ edge: 5, part: "khoran" }]);
  assert.equal(cross.dome?.base, 13);
  assert.equal(cross.dome?.bay, 4);
  assert.equal(cross.dome?.drumFrom, 9.4);
  // Ավանդատները ուղղանկյան մեջ են (առանձին դրսի ծավալ չունեն), դռներն ինքնին միացված են։
  assert.equal(cross.masses.length, 4);
  assert.equal(main.doors?.length, 3);
});

test("բլոկներ (v2). կցված բլոկները հետևում են ծնողին, սխալ պատը մերժվում է", () => {
  const model: ChurchModelV2 = {
    version: 2, id: "t", name: "Փորձ", tuff: "pink", look: { masonry: "checker", plinth: 0.5, roof: "tile" },
    blocks: [
      { id: "nav", kind: "hall", at: [0, 0], width: 8, length: 16, height: 7, ceiling: "vault", roof: "gable" },
      { id: "kh", kind: "apse", parent: "nav", wall: "east", width: 6, depth: 3, outside: "faceted" },
      { id: "g", kind: "dome", parent: "nav", offset: [0, -2], drum: 2, sides: 8, cap: "umbrella" },
      { id: "z", kind: "belfry", at: [0, 14], tower: 6, radius: 1, columns: 4, height: 2, tiers: 2 },
    ],
    items: [],
  };
  const first = compileModel(model);
  assert.deepEqual(first.errors, []);
  // Գմբեթը կամարի վրա է. կամարը ընդհատվում է գմբեթի տակ (երկու մաս)։
  assert.equal(first.model.dome?.base, 11);
  assert.equal(first.model.vaults.length, 2);
  // Երևացող խորանը՝ առանձին ծավալ, զանգակատունը՝ աշտարակով։
  assert.equal(first.model.masses.length, 3);
  assert.equal(first.model.belfry?.base, 6);
  // Նավը լայնացնելիս խորանը և գմբեթը մնում են տեղում (ոչինչ օդում)։
  const wider = compileModel({ ...model, blocks: model.blocks.map((b) => (b.id === "nav" ? { ...b, width: 10, height: 8 } : b)) }).model;
  assert.equal(wider.dome?.base, 13);
  assert.equal(wider.dome?.drumFrom, 8.4);
  const bad = validateAnyModel({ ...model, blocks: [...model.blocks, { id: "x", kind: "apse", parent: "nav", wall: "roof", width: 2, depth: 1, outside: "hidden" }] });
  assert.equal(bad.model, null);
  assert.ok(bad.errors.some((e) => e.includes("«roof»")));
});

/** D1-ի բավարար նմանակ node:sqlite-ի վրա։ */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT, published INTEGER)");
  sqlite.exec(readFileSync("migrations/0055_church_models.sql", "utf8"));
  sqlite.exec("INSERT INTO places VALUES ('zoravor', 'Զորավոր', 1)");
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async <T,>() => (sqlite.prepare(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => sqlite.prepare(sql).run(...(args as never[])),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: Array<{ run: () => Promise<unknown> }>) => { for (const item of list) await item.run(); },
  } as unknown as D1Database;
}

test("սևագիր → հրապարակում → տարբերակի վերադարձ", async () => {
  const db = fakeD1();
  assert.equal(await getPublishedModel(db, "zoravor"), null);
  assert.deepEqual(await saveDraft(db, "zoravor", "{bad", "a@x"), { ok: false, errors: ["JSON-ը կարդալ չհաջողվեց"] });
  const first = { ...TEMPLATES[1], id: "zoravor", name: "Զորավոր" };
  assert.deepEqual(await saveDraft(db, "zoravor", JSON.stringify(first), "a@x"), { ok: true });
  assert.equal(await getPublishedModel(db, "zoravor"), null, "սևագիրը կայքում չի երևում");
  assert.ok(await publishDraft(db, "zoravor", "owner@x"));
  assert.equal((await getPublishedModel(db, "zoravor"))?.model.tuff, "ochre");
  await saveDraft(db, "zoravor", JSON.stringify({ ...first, tuff: "black" }), "a@x");
  const record = await getModelRecord(db, "zoravor");
  assert.equal(record.changed, true);
  assert.equal(record.versions.length, 3);
  const oldest = record.versions.at(-1)!;
  assert.deepEqual(await restoreVersion(db, "zoravor", oldest.id, "a@x"), { ok: true });
  assert.equal((await getModelRecord(db, "zoravor")).draft?.tuff, "ochre");
});
