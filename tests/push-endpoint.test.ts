import assert from "node:assert/strict";
import test from "node:test";

import { safePushEndpoint } from "../app/utils/push-endpoint";

test("Web Push endpoint. միայն իսկական push-ծառայություններ", () => {
  // Թույլատրված
  assert.ok(safePushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(safePushEndpoint("https://web.push.apple.com/xyz"));
  assert.ok(safePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  assert.ok(safePushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x"));
  // Արգելված՝ SSRF-ի դաս
  assert.equal(safePushEndpoint("https://attacker.example/collect"), null);
  assert.equal(safePushEndpoint("http://fcm.googleapis.com/x"), null);        // http
  assert.equal(safePushEndpoint("https://user:pass@fcm.googleapis.com/x"), null); // userinfo
  assert.equal(safePushEndpoint("https://fcm.googleapis.com:8443/x"), null);  // port
  assert.equal(safePushEndpoint("https://169.254.169.254/latest"), null);     // metadata IP
  assert.equal(safePushEndpoint("https://fcm.googleapis.com.evil.example/x"), null); // suffix խաբեություն
  assert.equal(safePushEndpoint("not a url"), null);
  assert.equal(safePushEndpoint(null), null);
});
