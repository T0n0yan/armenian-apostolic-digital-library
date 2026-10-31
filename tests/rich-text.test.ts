import assert from "node:assert/strict";
import test from "node:test";

import { parseRichText } from "../app/utils/rich-text";

test("a place's story reads headings, lists and paragraphs", () => {
  const blocks = parseRichText("## Պատմություն\nԿառուցվել է 2001-ին։\nՕծվել է 2002-ին։\n\n- Խաչքար\n• Զանգակատուն\n\n1. Առաջին\n2) Երկրորդ\nՎերջ։");
  assert.deepEqual(blocks, [
    { type: "heading", text: "Պատմություն" },
    { type: "paragraph", text: "Կառուցվել է 2001-ին։\nՕծվել է 2002-ին։" },
    { type: "bullets", items: ["Խաչքար", "Զանգակատուն"] },
    { type: "numbers", items: ["Առաջին", "Երկրորդ"] },
    { type: "paragraph", text: "Վերջ։" },
  ]);
});

test("ordinary text is not taken for markup", () => {
  assert.deepEqual(parseRichText("2001 թվականին\n-ից հետո"), [{ type: "paragraph", text: "2001 թվականին\n-ից հետո" }]);
});
