import assert from "node:assert/strict";
import test from "node:test";

import { isShortMaterialPath, materialIdFromShortPath, materialPath } from "../app/utils/material-path";

test("library posts get short addresses by section and resolve back to their id", () => {
  const id = "material_tg_n1002993860753_364";
  assert.equal(materialPath(id, "Աղոթքներ"), "/pray_364");
  assert.equal(materialPath(id, "category_psalms"), "/psalm_364");
  assert.equal(materialPath(id, null), "/post_364");
  assert.equal(materialIdFromShortPath("pray_364"), id);
  assert.equal(materialIdFromShortPath("pray_364.data"), null);
  assert.equal(materialIdFromShortPath("saved"), null);
  assert.ok(isShortMaterialPath("/day_12"));
  // Posts from another chat keep the long address.
  assert.equal(materialPath("material_tg_n100_5", "Աղոթքներ"), "/materials/material_tg_n100_5");
});
