import assert from "node:assert/strict";
import test from "node:test";

import { bezelWidth, displacementAt } from "../app/utils/liquid-glass";

const shape = { width: 200, height: 80, radius: 40 };

test("ապակու կենտրոնում տեղաշարժ չկա", () => {
  assert.deepEqual(displacementAt(100, 40, shape), [0, 0]);
});

test("եզրին տեղաշարժը ուժեղ է և դեպի ներս", () => {
  const [left] = displacementAt(1, 40, shape);
  const [right] = displacementAt(199, 40, shape);
  assert.ok(left > 0.5, `ձախ եզր ${left}`);
  assert.ok(right < -0.5, `աջ եզր ${right}`);
  const [, top] = displacementAt(100, 1, shape);
  assert.ok(top > 0.5);
});

test("տեղաշարժը եզրից ներս նվազում է", () => {
  const near = Math.abs(displacementAt(100, 2, shape)[1]);
  const far = Math.abs(displacementAt(100, 2 + bezelWidth(shape) * 0.6, shape)[1]);
  assert.ok(near > far);
});

test("անկյունից դուրս տեղաշարժ չկա", () => {
  assert.deepEqual(displacementAt(1, 1, shape), [0, 0]);
});
