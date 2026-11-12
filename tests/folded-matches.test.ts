import assert from "node:assert/strict";
import { test } from "node:test";

import { foldedMatches, locateStoredSearchHit, parseTelegramSearchQuery } from "../shared/telegram-search";

const text = "Անօրէնութեան հեղեղն ինձ վրդովեց. Տէրն իմ հովիւն է, անիրաւ մարդուց փրկիր։ Թագաւորութիւն";
const found = (query: string) => foldedMatches(text, query).map(({ start, end }) => text.slice(start, end));

test("հին և նոր ուղղագրությունը համեմատվում են", () => {
  assert.deepEqual(found("անիրավ"), ["անիրաւ"]);
  assert.deepEqual(found("Տեր"), ["Տէր"]);
  assert.deepEqual(found("հովիվ"), ["հովիւ"]);
  assert.deepEqual(found("թագավորություն"), ["Թագաւորութիւն"]);
  assert.deepEqual(found("անօրենության"), ["Անօրէնութեան"]);
  assert.deepEqual(found("չկա"), []);
});

test("երկար տեքստում հատվածը ցույց է տալիս դասական գրությամբ բառը", () => {
  const long = `${"Սաղմոսի տող։ ".repeat(80)}Ազատիր ինձ անիրաւ մարդուց։ ${"Վերջ։ ".repeat(40)}`;
  const query = parseTelegramSearchQuery("անիրավ");
  const normalized = long.toLocaleLowerCase("hy-AM");
  const at = normalized.indexOf("անիրաւ");
  const hit = locateStoredSearchHit(long, { kind: "content", blockId: "formatted-text", normalized } as never, query, { rank: 4, normalizedStart: at } as never);
  assert.ok(hit, "hit");
  assert.equal(long.slice(hit.start, hit.start + hit.length), "անիրաւ");
});
