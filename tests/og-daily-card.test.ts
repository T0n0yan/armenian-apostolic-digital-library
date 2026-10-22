import assert from "node:assert/strict";
import test from "node:test";

import { dailyCardText } from "../app/utils/og-card-layout";

const title = "22 ՀՈԿՏԵՄԲԵՐԻ, 2026";

test("a daily reading's card shows the day's heading, not the text under it", () => {
  const text = `${title}\n\nՍ. ԽԱՐԻԹՅԱՆՆԵՐԻ ՀԻՇԱՏԱԿՈՒԹՅԱՆ ՕՐ\n\nՍ. Խարիթյանները քրիստոնյա նահատակներ էին։\n\nՕրվա ընթերցանությունները\n\n- Եսայի 51.22–52.3\n- Մատթեոս 10.26–33`;
  assert.equal(dailyCardText(text, title), "Ս. ԽԱՐԻԹՅԱՆՆԵՐԻ ՀԻՇԱՏԱԿՈՒԹՅԱՆ ՕՐ");
  assert.equal(dailyCardText(`${title}\n\nՊԱՀՈՑ ՕՐ\n\nՕրվա ընթերցումները\n\n- Եսայի 66.18–21`, title), "ՊԱՀՈՑ ՕՐ");
});

test("a day without a heading shows its readings", () => {
  const text = `${title}\n\nՕրվա ընթերցումները\n\n- Եսայի 66.18–21\n- Առակներ 15.27–32\n\nԵսայի 66.18–21\n\n[18] Ես նրանց գործերն ու խորհուրդները գիտեմ։`;
  assert.equal(dailyCardText(text, title), "Եսայի 66.18–21 · Առակներ 15.27–32");
  assert.equal(dailyCardText(`${title}\n\nՄի տեքստ։`, title), "");
});
