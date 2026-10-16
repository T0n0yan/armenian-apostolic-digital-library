import assert from "node:assert/strict";
import test from "node:test";

import bigInt from "big-integer";

import { mapRichMessage } from "../services/telegram-bridge/src/rich-message";
import { mapFormattedText } from "../services/telegram-bridge/src/gramjs-adapter";
import { Api } from "../services/telegram-bridge/src/telegram-client";

const emptyCaption = () => new Api.PageCaption({ text: new Api.TextEmpty(), credit: new Api.TextEmpty() });

test("standard Telegram entities preserve UTF-16 offsets and reject unsafe protocols", () => {
  const text = "🙏🏽 Թավ հղում";
  const mapped = mapFormattedText(text, [
    new Api.MessageEntityBold({ offset: 5, length: 3 }),
    new Api.MessageEntityTextUrl({ offset: 9, length: 4, url: "javascript:alert(1)" }),
    new Api.MessageEntitySpoiler({ offset: 5, length: 7 }),
  ]);
  assert.equal(mapped.text.slice(mapped.entities[0]!.offset, mapped.entities[0]!.offset + mapped.entities[0]!.length), "Թավ");
  assert.deepEqual(mapped.entities.map((entity) => entity.type), ["bold", "spoiler"]);
});

test("Teleproto RichMessage mapping preserves block/media order and nested inline formatting", () => {
  const photo = new Api.Photo({
    id: bigInt(10), accessHash: bigInt(11), fileReference: Buffer.from("fixture"), date: 1,
    sizes: [new Api.PhotoSize({ type: "x", w: 800, h: 600, size: 4096 })], dcId: 2,
  });
  const document = new Api.Document({
    id: bigInt(20), accessHash: bigInt(21), fileReference: Buffer.from("fixture"), date: 1,
    mimeType: "video/mp4", size: bigInt(8192), dcId: 2,
    attributes: [new Api.DocumentAttributeVideo({ duration: 10, w: 1280, h: 720 })],
  });
  const rich = new Api.RichMessage({
    blocks: [
      new Api.PageBlockHeading1({ text: new Api.TextPlain({ text: "Վերնագիր" }) }),
      new Api.PageBlockParagraph({ text: new Api.TextConcat({ texts: [
        new Api.TextBold({ text: new Api.TextPlain({ text: "Թավ" }) }),
        new Api.TextPlain({ text: "\nտող" }),
        new Api.TextUrl({ text: new Api.TextPlain({ text: "անվտանգ" }), url: "https://example.com", webpageId: bigInt(0) }),
        new Api.TextUrl({ text: new Api.TextPlain({ text: "վտանգավոր" }), url: "javascript:alert(1)", webpageId: bigInt(0) }),
      ] }) }),
      new Api.PageBlockPhoto({ photoId: photo.id, caption: emptyCaption() }),
      new Api.PageBlockDivider(),
      new Api.PageBlockVideo({ videoId: document.id, caption: emptyCaption() }),
    ],
    photos: [photo],
    documents: [document],
  });

  const mapped = mapRichMessage(rich);
  assert.deepEqual(mapped.content.blocks.map((block) => block.type), ["heading", "paragraph", "media", "divider", "media"]);
  assert.deepEqual(mapped.content.blocks.filter((block) => block.type === "media").map((block) => block.mediaIndex), [0, 1]);
  assert.deepEqual(mapped.mediaSources.map((source) => source.id.toString()), ["10", "20"]);
  const paragraph = mapped.content.blocks[1];
  assert.equal(paragraph.type, "paragraph");
  if (paragraph.type !== "paragraph") return;
  assert.ok(paragraph.content.some((node) => node.type === "line-break"));
  assert.equal(paragraph.content.find((node) => node.type === "link" && node.url?.startsWith("https"))?.type, "link");
  const rejectedLink = paragraph.content.find((node) => node.type === "link" && node.children.some((child) => child.type === "text" && child.text === "վտանգավոր"));
  assert.equal(rejectedLink?.type === "link" ? rejectedLink.url : undefined, null);
});

test("unknown RichMessage nodes degrade locally instead of dropping the material", () => {
  const rich = new Api.RichMessage({
    blocks: [
      new Api.PageBlockParagraph({ text: new Api.TextPlain({ text: "Տեսանելի տեքստ" }) }),
      new Api.PageBlockUnsupported(),
      new Api.PageBlockParagraph({ text: new Api.TextCustomEmoji({ documentId: bigInt(99), alt: "✝️" }) }),
    ],
    photos: [],
    documents: [],
  });
  const mapped = mapRichMessage(rich);
  assert.equal(mapped.content.blocks[0]?.type, "paragraph");
  assert.equal(mapped.content.blocks[1]?.type, "unsupported");
  assert.equal(mapped.content.blocks[2]?.type, "paragraph");
  assert.match(mapped.plainText, /Տեսանելի/u);
});
