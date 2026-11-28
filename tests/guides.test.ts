import assert from "node:assert/strict";
import test from "node:test";

import { guideInput, guidePath, normalizeGuideBody, normalizeSources } from "../app/utils/guides";
import { NEW_GUIDES } from "../scripts/guides-seed/new";

test("ուղեցույցի մարմինը մաքրվում է", () => {
  const body = normalizeGuideBody({
    blocks: [{ id: "a", title: " Մկրտություն ", text: "x", tag: "canon", why: " ինչու ", extra: 1 }, { id: "a", title: "Կրկին", text: "" }, { title: "" }, "x"],
    faq: [{ q: "Հարց", a: "Պատ" }, { q: "Առանց պատասխանի" }],
  });
  assert.equal(body.blocks.length, 2);
  assert.deepEqual(body.blocks[0], { id: "a", title: "Մկրտություն", text: "x", tag: "canon", why: "ինչու" });
  assert.notEqual(body.blocks[1].id, "a");
  assert.equal(body.faq.length, 1);
  assert.deepEqual(normalizeGuideBody(null), { blocks: [], faq: [] });
});

test("անծանոթ պիտակը չի պահվում", () => {
  assert.equal(normalizeGuideBody({ blocks: [{ title: "x", text: "", tag: "magic" }] }).blocks[0].tag, undefined);
});

test("աղբյուրները՝ տող առ տող", () => {
  assert.deepEqual(normalizeSources("Ա\n\n Բ \n"), ["Ա", "Բ"]);
});

test("ադմինի ձևը ստուգվում է", () => {
  const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
  assert.equal(guideInput(form({ slug: "Bad Slug", title: "x" })), null);
  const input = guideInput(form({ slug: "fasting", title: "Պահք", status: "weird", kind: "link", link: "https://evil", body: "{" }));
  assert.equal(input?.status, "draft");
  assert.equal(input?.link, "");
  assert.deepEqual(input?.body, { blocks: [], faq: [] });
});

test("հղման ուղեցույցը տանում է իր էջը", () => {
  assert.equal(guidePath({ slug: "calendar", kind: "link", link: "/church/calendar" }), "/church/calendar");
  assert.equal(guidePath({ slug: "fasting", kind: "guide", link: "" }), "/church/fasting");
});

test("նոր սևագրերի հասցեները եզակի են, ամեն ուղեցույց ունի աղբյուրի նշում", () => {
  const slugs = NEW_GUIDES.map((guide) => guide.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const guide of NEW_GUIDES) if (guide.kind !== "link") assert.ok(guide.sources?.length && guide.blocks?.length, guide.slug);
});
