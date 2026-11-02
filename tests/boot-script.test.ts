import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { BOOT_SCRIPT, BOOT_SCRIPT_SHA256 } from "../app/utils/boot-script";

// CSP-ն թույլ է տալիս boot-script-ը միայն այս հաշով։ Փոխելիս՝ թարմացնել BOOT_SCRIPT_SHA256-ը, այլապես
// էջը կկոտրվի (script-ը CSP-ով կարգելափակվի)։
test("boot-script-ի հաշը համընկնում է CSP-ի արժեքին", () => {
  const actual = "sha256-" + createHash("sha256").update(BOOT_SCRIPT).digest("base64");
  assert.equal(actual, BOOT_SCRIPT_SHA256, "Թարմացրեք BOOT_SCRIPT_SHA256-ը app/utils/boot-script.ts-ում՝\n  " + actual);
});
