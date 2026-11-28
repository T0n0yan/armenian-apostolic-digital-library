import assert from "node:assert/strict";
import test from "node:test";

import { churchAudioUrl, groupByPart, isPeople, lineAt } from "../app/utils/liturgy-text";

test("ձայնագրության ժամանակով՝ ընթացիկ տողը", () => {
  const lines = [{ start: 0 }, { start: null }, { start: 12.5 }, { start: 30 }];
  assert.equal(lineAt(lines, 5), 0);
  assert.equal(lineAt(lines, 12.5), 2);
  assert.equal(lineAt(lines, 100), 3);
  assert.equal(lineAt([{ start: 3 }], 1), -1);
});

test("տողերը խմբավորվում են ըստ մասի", () => {
  const groups = groupByPart([{ part: "Ա" }, { part: "Ա" }, { part: "Բ" }, { part: "Ա" }]);
  assert.deepEqual(groups.map((group) => [group.part, group.lines.map((line) => line.index)]), [["Ա", [0, 1]], ["Բ", [2]], ["Ա", [3]]]);
});

test("ժողովրդի պատասխանները և ձայնագրության հասցեն", () => {
  assert.ok(isPeople("people") && isPeople("all") && !isPeople("priest"));
  assert.equal(churchAudioUrl("church/patarag-abc.mp3"), "/church-media/patarag-abc.mp3");
});

test("շարականների ֆիլտրը", async () => {
  const { filterHymns, isHour } = await import("../app/utils/hymns");
  const hymns = [{ feast: "Զատիկ", hour: "aravotyan" as const, mode: "Ա ձայն" }, { feast: "Ծնունդ", hour: "" as const, mode: "Բ կողմ" }];
  assert.equal(filterHymns(hymns, {}).length, 2);
  assert.equal(filterHymns(hymns, { feast: "Զատիկ", hour: "aravotyan" }).length, 1);
  assert.equal(filterHymns(hymns, { mode: "Գ ձայն" }).length, 0);
  assert.ok(isHour("gisherayin") && !isHour("noon"));
});
