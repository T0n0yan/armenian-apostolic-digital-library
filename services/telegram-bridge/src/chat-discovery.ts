import { Api, utils } from "telegram";
import type { Entity } from "telegram/define";

export type DiscoveredTelegramChat = {
  title: string;
  username: string | null;
  chatId: string;
  type: "group" | "supergroup" | "channel";
  forum: boolean;
};

function cleanDisplayValue(value: string) {
  return value.replace(/[\r\n\t]+/gu, " ").trim();
}

export function describeTelegramChat(entity: Entity): DiscoveredTelegramChat | null {
  if (entity instanceof Api.Chat) {
    return {
      title: cleanDisplayValue(entity.title),
      username: null,
      chatId: utils.getPeerId(entity).toString(),
      type: "group",
      forum: false,
    };
  }
  if (entity instanceof Api.Channel) {
    return {
      title: cleanDisplayValue(entity.title),
      username: entity.username ? cleanDisplayValue(entity.username) : null,
      chatId: utils.getPeerId(entity).toString(),
      type: entity.megagroup ? "supergroup" : "channel",
      forum: Boolean(entity.forum),
    };
  }
  return null;
}

export function maskTelegramAccountId(accountId: string) {
  const suffix = accountId.replace(/\D/gu, "").slice(-4);
  return suffix ? `••••${suffix}` : "••••";
}
