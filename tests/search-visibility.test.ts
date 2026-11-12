import assert from "node:assert/strict";
import test from "node:test";
import { cardImage, materialSeoTitle, seoMeta } from "../app/utils/seo";

function value(meta: ReturnType<typeof seoMeta>, key: "name" | "property" | "rel", name: string) {
  const item = meta.find((entry) => key in entry && (entry as Record<string, unknown>)[key] === name);
  return item && ("href" in item ? item.href : "content" in item ? item.content : undefined);
}

test("համարի հիմնական էջը սաղմոսն է, կիսվելու հասցեն և նկարը՝ համարինը", () => {
  for (const origin of ["https://apostolic.am", "https://staging.apostolic.am"]) {
    const picture = cardImage(origin, "/psalms/47/3", "2026-11-12");
    const meta = seoMeta({ title: "Սաղմոս 47:3", description: "Համարի տեքստը", path: "/psalms/47/3", canonicalPath: "/psalms/47", origin, image: picture, type: "article" });
    assert.equal(value(meta, "rel", "canonical"), "https://apostolic.am/psalms/47");
    assert.equal(value(meta, "property", "og:url"), `${origin}/psalms/47/3`);
    assert.equal(value(meta, "property", "og:image"), picture);
    assert.equal(value(meta, "name", "twitter:image"), picture);
    assert.equal(value(meta, "name", "robots"), "index, follow, max-image-preview:large");
    assert.equal(meta.filter((entry) => "rel" in entry && entry.rel === "canonical").length, 1);
  }
});

test("ամբողջ նյութն իր հիմնական հասցեն ունի, noindex էջը չի բացվում որոնման համար", () => {
  const material = seoMeta({ title: "Հայր մեր", description: "Աղոթք", path: "/pray/69" });
  assert.equal(value(material, "rel", "canonical"), "https://apostolic.am/pray/69");
  const emptyPlace = seoMeta({ title: "Սրբավայր", description: "Տեղադրություն", path: "/places/example", index: false });
  assert.equal(value(emptyPlace, "name", "robots"), "noindex, follow");
});

test("սաղմոսի համարը մնում է երկար և նկարագրական որոնման վերնագրերում", () => {
  assert.match(materialSeoTitle("ՍԻՈՆՆ ԱՍՏԾՈՒ ՔԱՂԱՔՆ Է", "", "Սաղմոսներ", "/psalms/47"), /^Սաղմոս 47․ /u);
  const long = materialSeoTitle("Երկար նկարագրություն ".repeat(15), "", "Սաղմոսներ", "/psalms/119");
  assert.match(long, /^Սաղմոս 119․ /u);
  assert.ok(long.length <= 65);
  const numbered = materialSeoTitle("Սաղմոս 22", "", "Սաղմոսներ", "/psalms/22");
  assert.equal((numbered.match(/Սաղմոս 22/gu) ?? []).length, 1);
  assert.match(materialSeoTitle("Հայր մեր", "", "Աղոթքներ", "/pray/69"), /^Հայր մեր — Աղոթքներ/u);
});
