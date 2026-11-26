import assert from "node:assert/strict";
import test from "node:test";

import { ETIQUETTE_TOPICS, POPULAR_QUESTIONS, etiquetteTopic } from "../app/data/etiquette";
import { searchEtiquette } from "../app/utils/etiquette-search";

test("բաժինների և կանոնների հասցեները եզակի են", () => {
  const slugs = ETIQUETTE_TOPICS.map((topic) => topic.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const topic of ETIQUETTE_TOPICS) {
    const ids = topic.rules.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length, topic.slug);
  }
});

test("հաճախ տրվող հարցերը տանում են գոյություն ունեցող կանոնի", () => {
  for (const [, slug, id] of POPULAR_QUESTIONS) {
    const topic = etiquetteTopic(slug);
    assert.notEqual(topic?.status, "soon", slug);
    assert.ok(topic?.rules.some((rule) => rule.id === id), `${slug}#${id}`);
  }
});

test("որոնումը գտնում է բառը վերջավորությամբ", () => {
  assert.equal(searchEtiquette("գլխաշոր")[0]?.href, "/church/etiquette/appearance#headscarf");
  assert.ok(searchEtiquette("մոմը").some((hit) => hit.href.startsWith("/church/etiquette/candles")));
  assert.ok(searchEtiquette("քահանային").length > 0);
  assert.deepEqual(searchEtiquette(""), []);
});

test("որոնումը գտնում է նաև ուղեցույցի էջերում", () => {
  assert.ok(searchEtiquette("քառասունք").some((hit) => hit.href === "/church/remembrance#karasunk"));
});

test("ամեն բաժին ունի աղբյուր", () => {
  for (const topic of ETIQUETTE_TOPICS) if (topic.status !== "soon") assert.ok(topic.sources?.length, topic.slug);
});
