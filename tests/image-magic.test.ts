import assert from "node:assert/strict";
import test from "node:test";

import { sniffImageType } from "../app/utils/image-magic";

test("sniffImageType. ճանաչում է իսկական տեսակը, մերժում կեղծը", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 1, 1, 1, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(webp), "image/webp");
  // Script/HTML/SVG ծպտված որպես նկար՝ null
  assert.equal(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImageType(new TextEncoder().encode("<!doctype html>")), null);
  assert.equal(sniffImageType(new Uint8Array([1, 2, 3])), null);
});
