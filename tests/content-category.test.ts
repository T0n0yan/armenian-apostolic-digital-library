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
