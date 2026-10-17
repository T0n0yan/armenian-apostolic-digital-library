import type { BridgeRichBlock, BridgeRichContent, BridgeRichInline } from "../../../shared/telegram-bridge-contract";
import { Api, Rich } from "./telegram-client";

export type RichMediaSource = Api.Photo | Api.Document;

function safeLink(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/iu.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function textNodes(value: string): BridgeRichInline[] {
  return value.split("\n").flatMap((part, index, all) => [
    ...(part ? [{ type: "text" as const, text: part }] : []),
    ...(index < all.length - 1 ? [{ type: "line-break" as const }] : []),
  ]);
}

export function mapRichInline(value: Api.TypeRichText): BridgeRichInline[] {
  if (value instanceof Api.TextEmpty) return [];
  if (value instanceof Api.TextPlain) return textNodes(value.text);
  if (value instanceof Api.TextConcat) return value.texts.flatMap(mapRichInline);
  if (value instanceof Api.TextCustomEmoji) return [{ type: "custom-emoji", alt: value.alt, documentId: value.documentId.toString() }];
  if (value instanceof Api.TextImage) return [{ type: "custom-emoji", alt: "◻", documentId: value.documentId.toString() }];

  const nested = "text" in value && value.text && typeof value.text === "object"
    ? mapRichInline(value.text as Api.TypeRichText)
    : [];
  if (value instanceof Api.TextBold) return [{ type: "bold", children: nested }];
  if (value instanceof Api.TextItalic) return [{ type: "italic", children: nested }];
  if (value instanceof Api.TextUnderline) return [{ type: "underline", children: nested }];
  if (value instanceof Api.TextStrike) return [{ type: "strikethrough", children: nested }];
  if (value instanceof Api.TextSpoiler) return [{ type: "spoiler", children: nested }];
  if (value instanceof Api.TextFixed) return [{ type: "code", children: nested }];
  if (value instanceof Api.TextSubscript) return [{ type: "subscript", children: nested }];
  if (value instanceof Api.TextSuperscript) return [{ type: "superscript", children: nested }];
  if (value instanceof Api.TextMarked) return [{ type: "mark", children: nested }];
  if (value instanceof Api.TextUrl) return [{ type: "link", url: safeLink(value.url), children: nested }];
  if (value instanceof Api.TextEmail) return [{ type: "link", url: safeLink(`mailto:${value.email}`), children: nested }];
  if (value instanceof Api.TextPhone) return [{ type: "link", url: safeLink(`tel:${value.phone}`), children: nested }];
  if (value instanceof Api.TextAutoUrl) {
    const text = Rich.renderRichText(value.text, "text");
    return [{ type: "link", url: safeLink(text), children: nested }];
  }
  if (value instanceof Api.TextAutoEmail) {
    const text = Rich.renderRichText(value.text, "text");
    return [{ type: "link", url: safeLink(`mailto:${text}`), children: nested }];
  }
  if (value instanceof Api.TextAutoPhone) {
    const text = Rich.renderRichText(value.text, "text");
    return [{ type: "link", url: safeLink(`tel:${text}`), children: nested }];
  }
  if (nested.length > 0) return nested;
  return [{ type: "unsupported", telegramType: value.className ?? "RichTextUnknown" }];
}

function caption(value: Api.TypePageCaption) {
  return [...mapRichInline(value.text), ...mapRichInline(value.credit)];
}

function mediaId(value: Api.Photo | Api.Document) {
  return value.id.toString();
}

/**
 * Teleproto's plain-text rendering marks media as "[audio]" or "[photo: caption]". Those markers
 * must not become titles or excerpts: drop bare markers and keep only a caption's text.
 */
export function stripRichMediaPlaceholders(value: string) {
  return value
    .replace(/\[(?:photo|video|audio|document):\s*([^\]\n]*)\]/gu, "$1")
    .replace(/\[(?:photo|video|audio|document)\]/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function mapRichMessage(value: Api.RichMessage): { content: BridgeRichContent; plainText: string; mediaSources: RichMediaSource[] } {
  const sourcesById = new Map<string, RichMediaSource>();
  for (const source of [...value.photos, ...value.documents]) {
    if (source instanceof Api.Photo || source instanceof Api.Document) sourcesById.set(mediaId(source), source);
  }
  const mediaSources: RichMediaSource[] = [];
  const mediaIndexes = new Map<string, number>();
  const indexFor = (id: string) => {
    const existing = mediaIndexes.get(id);
    if (existing !== undefined) return existing;
    const source = sourcesById.get(id);
    if (!source) return null;
    const index = mediaSources.length;
    mediaSources.push(source);
    mediaIndexes.set(id, index);
    return index;
  };

  const blocks = (items: Api.TypePageBlock[]): BridgeRichBlock[] => items.flatMap((block): BridgeRichBlock[] => {
    const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, text: Api.TypeRichText): BridgeRichBlock[] => [{ type: "heading", level, content: mapRichInline(text) }];
    if (block instanceof Api.PageBlockTitle || block instanceof Api.PageBlockHeading1) return heading(1, block.text);
    if (block instanceof Api.PageBlockHeader || block instanceof Api.PageBlockHeading2) return heading(2, block.text);
    if (block instanceof Api.PageBlockSubheader || block instanceof Api.PageBlockHeading3) return heading(3, block.text);
    if (block instanceof Api.PageBlockHeading4) return heading(4, block.text);
    if (block instanceof Api.PageBlockHeading5) return heading(5, block.text);
    if (block instanceof Api.PageBlockHeading6) return heading(6, block.text);
    if (block instanceof Api.PageBlockSubtitle || block instanceof Api.PageBlockKicker || block instanceof Api.PageBlockFooter || block instanceof Api.PageBlockParagraph) {
      return [{ type: "paragraph", content: mapRichInline(block.text) }];
    }
    if (block instanceof Api.PageBlockPreformatted) return [{ type: "pre", language: block.language || null, content: mapRichInline(block.text) }];
    if (block instanceof Api.PageBlockDivider) return [{ type: "divider" }];
    if (block instanceof Api.PageBlockBlockquote || block instanceof Api.PageBlockPullquote) {
      return [{ type: "blockquote", expandable: block instanceof Api.PageBlockBlockquote && Boolean(block.collapsed), blocks: [{ type: "paragraph", content: mapRichInline(block.text) }], caption: mapRichInline(block.caption) }];
    }
    if (block instanceof Api.PageBlockBlockquoteBlocks) {
      return [{ type: "blockquote", expandable: true, blocks: blocks(block.blocks), caption: mapRichInline(block.caption) }];
    }
    if (block instanceof Api.PageBlockList || block instanceof Api.PageBlockOrderedList) {
      const ordered = block instanceof Api.PageBlockOrderedList;
      const listItems = block.items.map((item) => {
        if (item instanceof Api.PageListItemText || item instanceof Api.PageListOrderedItemText) return [{ type: "paragraph" as const, content: mapRichInline(item.text) }];
        if (item instanceof Api.PageListItemBlocks || item instanceof Api.PageListOrderedItemBlocks) return blocks(item.blocks);
        return [{ type: "unsupported" as const, telegramType: "PageListItemUnknown" }];
      });
      return [{ type: "list", ordered, start: ordered ? block.start ?? null : null, items: listItems }];
    }
    if (block instanceof Api.PageBlockPhoto) {
      const mediaIndex = indexFor(block.photoId.toString());
      return mediaIndex === null ? [{ type: "unsupported", telegramType: "PageBlockPhotoMissing" }] : [{ type: "media", mediaIndex, caption: caption(block.caption) }];
    }
    if (block instanceof Api.PageBlockVideo || block instanceof Api.PageBlockAudio || block instanceof Api.PageBlockDocument) {
      const id = block instanceof Api.PageBlockVideo ? block.videoId : block instanceof Api.PageBlockAudio ? block.audioId : block.documentId;
      const mediaIndex = indexFor(id.toString());
      return mediaIndex === null ? [{ type: "unsupported", telegramType: `${block.className}Missing` }] : [{ type: "media", mediaIndex, caption: caption(block.caption) }];
    }
    if (block instanceof Api.PageBlockCover) return blocks([block.cover]);
    if (block instanceof Api.PageBlockCollage || block instanceof Api.PageBlockSlideshow) return [...blocks(block.items), ...(caption(block.caption).length ? [{ type: "paragraph" as const, content: caption(block.caption) }] : [])];
    if (block instanceof Api.PageBlockDetails) return [{ type: "blockquote", expandable: !block.open, blocks: blocks(block.blocks), caption: mapRichInline(block.title) }];
    return [{ type: "unsupported", telegramType: block.className ?? "PageBlockUnknown" }];
  });

  return {
    content: {
      blocks: blocks(value.blocks),
      partial: Boolean(value.part),
    },
    plainText: stripRichMediaPlaceholders(Rich.toPlainText(value).normalize("NFC")),
    mediaSources,
  };
}
