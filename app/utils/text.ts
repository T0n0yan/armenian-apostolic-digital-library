import type { BridgeRichInline } from "../../shared/telegram-bridge-contract";

/** Zero-width characters Telegram text often carries (ZWSP, ZWNJ, ZWJ, BOM). */
export const ZERO_WIDTH = /[​-‍﻿]/gu;

export function stripZeroWidth(value: string) {
  return value.replace(ZERO_WIDTH, "");
}

/** Plain text of rich inline nodes; line breaks become spaces. */
export function richInlineText(nodes: BridgeRichInline[]): string {
  return nodes.map((node) => node.type === "text" ? node.text
    : node.type === "custom-emoji" ? node.alt
      : node.type === "line-break" ? " "
        : node.type === "unsupported" ? ""
          : richInlineText(node.children)).join("");
}
