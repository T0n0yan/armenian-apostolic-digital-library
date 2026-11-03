import assert from "node:assert/strict";
import test from "node:test";

import { readWebPlace } from "../app/utils/place-web-form";

function form(entries: Array<[string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

test("the site's place form reads like the bot's answers", () => {
  const { errors, fields } = readWebPlace(form([
    ["name", "Սուրբ Գրիգոր Նարեկացի եկեղեցի"], ["kind", "church"], ["location", "https://www.google.com/maps?q=40.1500,44.0400"],
    ["active", "yes"], ["liturgy", "Կիրակի 10:00"], ["clergyRole", "Ավագ քահանա"], ["clergyName", "Տաճատ Ինջիղուլյան"],
    ["clergyRole", "Դպիր"], ["clergyName", "Արմեն Սարգսյան"], ["access-access", "այո, մինչև եկեղեցի"], ["access-ramp", "չկա"], ["access-entrance", "մի քանի աստիճան"], ["access-road", "ինչ-որ բան"],
    ["credit", "anonymous"], ["creditName", "Անի"],
  ]));
  assert.deepEqual(errors, {});
  assert.deepEqual(fields.point, { latitude: 40.15, longitude: 44.04 });
  assert.equal(fields.clergy, "Ավագ քահանա՝ Արժանապատիվ Տ. Տաճատ ավգ. քհն. Ինջիղուլյան\nԴպիր՝ Քաղցրաշնորհ Արմեն դպր. Սարգսյան");
  // Միայն պատրաստի տարբերակները, հերթականությամբ. անհայտ արժեքը բաց է թողնվում։
  assert.equal(fields.accessibility, "Մեքենայով հասանելիություն՝ այո, մինչև եկեղեցի\nԹեքահարթակ՝ չկա\nՄուտք՝ մի քանի աստիճան");
  assert.equal(fields.credit, false);
  assert.equal(fields.creditName, "");
});

test("the form asks for a name, a kind and a place in Armenia", () => {
  assert.deepEqual(Object.keys(readWebPlace(form([["name", "Ա"], ["location", "48.85, 2.35"]])).errors).sort(), ["kind", "location", "name"]);
  assert.ok(readWebPlace(form([["name", "Սուրբ Աստվածածին"], ["kind", "chapel"], ["location", "abc"]])).errors.location);
});

test("a place that isn't working keeps no Liturgy or clergy", () => {
  const { fields } = readWebPlace(form([["name", "Մատուռ"], ["kind", "chapel"], ["location", "40.1000, 44.5000"], ["active", "no"], ["liturgy", "Կիրակի"], ["clergyRole", "Սարկավագ"], ["clergyName", "Արամ"]]));
  assert.equal(fields.liturgy, "");
  assert.equal(fields.clergy, "");
});
