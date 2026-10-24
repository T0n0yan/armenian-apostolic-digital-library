import assert from "node:assert/strict";
import test from "node:test";

import { foreignSuggestions, loadSearchIndex, searchTitles, translateQuery, type SearchIndex } from "../app/utils/local-search";

test("English and Russian words become the Armenian terms", () => {
  assert.equal(translateQuery("Prayer"), "Աղոթք");
  assert.equal(translateQuery("молит"), "Աղոթք");
  assert.equal(translateQuery("Отче наш"), "Հայր մեր");
  assert.equal(translateQuery("Առավոտ"), "Առավոտ");
  assert.deepEqual(foreignSuggestions("ps"), ["Սաղմոս"]);
  assert.deepEqual(foreignSuggestions("աղ"), []);
});

const index: SearchIndex = {
  version: "1",
  categories: { pray: ["Աղոթքներ", "pray"], psalms: ["Սաղմոսներ", "psalms"] },
  items: [
    ["c_71", "/pray/71", "Տերունական աղոթք", "pray", null, "2026-10-01", "text", null, 0],
    ["c_80", "/psalms/22", "Սաղմոս 22", "psalms", 22, "2026-09-01", "text", null, 0],
    ["c_81", "/psalms/3", "Սաղմոս 3", "psalms", 3, "2026-09-02", "text", null, 0],
  ],
};

async function loadedIndex() {
  // No Cache Storage in Node, so the index comes straight from this stub.
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(index)) as typeof fetch;
  try { return await loadSearchIndex("1"); } finally { globalThis.fetch = original; }
}

test("titles are searched on the phone", async () => {
  const loaded = await loadedIndex();
  assert.ok(loaded);
  assert.deepEqual(searchTitles(loaded, "Տերունական").map((item) => item.id), ["c_71"]);
  assert.deepEqual(searchTitles(loaded, "psalm").map((item) => item.id), ["c_81", "c_80"]);
  assert.deepEqual(searchTitles(loaded, "22").map((item) => item.id), ["c_80"]);
  assert.deepEqual(searchTitles(loaded, "Տերունական", "psalms"), []);
});
