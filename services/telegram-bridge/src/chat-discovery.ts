import { Api, utils, type Entity } from "./telegram-client";

export type DiscoveredTelegramChat = {
  title: string;
  username: string | null;
  chatId: string;
  type: "group" | "supergroup" | "channel";
  forum: boolean;
};

type TelegramDialogEntry = {
  entity?: Entity;
};

export type TelegramDialogFolderIterator = (
  folder: 0 | 1,
) => AsyncIterable<TelegramDialogEntry>;

function cleanDisplayValue(value: string) {
  return value.replace(/[\r\n\t]+/gu, " ").trim();
}

export function describeTelegramChat(entity: Entity): DiscoveredTelegramChat | null {
  if (entity instanceof Api.Chat) {
    // Telegram keeps a migrated basic-group stub alongside its replacement
    // supergroup. The stub is not a distinct discoverable destination.
    if (entity.migratedTo) return null;

    return {
      title: cleanDisplayValue(entity.title),
      username: null,
      chatId: utils.getPeerId(entity).toString(),
      type: "group",
      forum: false,
    };
  }
  if (entity instanceof Api.Channel) {
    const forum = Boolean(entity.forum);
    return {
      title: cleanDisplayValue(entity.title),
      username: entity.username ? cleanDisplayValue(entity.username) : null,
      chatId: utils.getPeerId(entity).toString(),
      type: entity.megagroup || forum ? "supergroup" : "channel",
      forum,
    };
  }
  return null;
}

export async function collectDiscoverableTelegramChats(
  iterateFolder: TelegramDialogFolderIterator,
) {
  const chats = new Map<string, DiscoveredTelegramChat>();

  // Folder 0 is the main dialog list and folder 1 is Telegram's archive.
  // The supplied iterators must be unbounded so Teleproto performs cursor
  // pagination until each folder is exhausted.
  for (const folder of [0, 1] as const) {
    for await (const dialog of iterateFolder(folder)) {
      if (!dialog.entity) continue;
      const chat = describeTelegramChat(dialog.entity);
      if (chat) chats.set(chat.chatId, chat);
    }
  }

  return [...chats.values()].sort((left, right) => left.title.localeCompare(right.title, "hy"));
}

export function maskTelegramAccountId(accountId: string) {
  const suffix = accountId.replace(/\D/gu, "").slice(-4);
  return suffix ? `••••${suffix}` : "••••";
}
