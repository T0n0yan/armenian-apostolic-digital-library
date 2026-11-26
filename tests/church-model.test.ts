import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { computeHotspots, liturgyTour, validateModel } from "../app/church3d/model";
import { TEMPLATES } from "../app/church3d/templates";
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
