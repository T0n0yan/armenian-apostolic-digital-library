import assert from "node:assert/strict";
import test from "node:test";

import { resolveContentCategoryId } from "../shared/telegram-bridge-contract";

test("dynamic Telegram topics resolve to content categories by name", () => {
  assert.equal(resolveContentCategoryId("category_psalms"), "category_psalms");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:83", "Սաղմոսներ"), "category_psalms");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:205", " Օրվա ընթերցումներ "), "category_daily_readings");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:9", "Նոր թեմա"), null);
  assert.equal(resolveContentCategoryId("telegram_topic:-100:9"), null);
});

test("material pages skip a leading line that repeats the title", async () => {
  const { leadingTitleLength, richContentStartsWithTitle } = await import("../app/utils/material-title");
  assert.equal(leadingTitleLength("8 ՀՈԿՏԵՄԲԵՐԻ, 2026\n\nԱյսօր եկեղեցին…", "8 ՀՈԿՏԵՄԲԵՐԻ, 2026"), "8 ՀՈԿՏԵՄԲԵՐԻ, 2026\n\n".length);
  assert.equal(leadingTitleLength("​ԱՂՈԹՔ \nՏեր", "ԱՂՈԹՔ"), "​ԱՂՈԹՔ \n".length);
  assert.equal(leadingTitleLength("Այլ տող\nԱՂՈԹՔ", "ԱՂՈԹՔ"), 0);
  assert.equal(richContentStartsWithTitle({ partial: false, blocks: [{ type: "heading", level: 1, content: [{ type: "bold", children: [{ type: "text", text: "Սաղմոս 41" }] }] }] }, "Սաղմոս 41"), true);
  assert.equal(richContentStartsWithTitle({ partial: false, blocks: [{ type: "paragraph", content: [{ type: "text", text: "Ուրիշ" }] }] }, "Սաղմոս 41"), false);
});

test("topics renamed in Telegram keep their section by key word", () => {
  assert.equal(resolveContentCategoryId("telegram_topic:-100:136", "Սրբերի վարքը"), "category_saints_lives");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:136", "Սուրբերի վարքը"), "category_saints_lives");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:38", "Աղոթագիրք"), "category_prayers");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:83", "Դավթի սաղմոսները"), "category_psalms");
  assert.equal(resolveContentCategoryId("telegram_topic:-100:9", "Նորություններ"), null);
});
