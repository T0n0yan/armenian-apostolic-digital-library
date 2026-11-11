import { useRef } from "react";
import { useLocation, useRouteLoaderData } from "react-router";

import { useChatSocket } from "./chat-socket";
import type { ChatSide } from "../utils/private-chat";

export const UNREAD_EVENT = "private-chat-unread";

/**
 * Կայքի մյուս էջերում (ոչ /namak)՝ միայն երկու կողմի համար. մյուսը տեսնում է 🟡 («կայքում է»),
 * իսկ մենյուի ✉-ը իմանում է չկարդացվածների մասին միանգամից։ Ոչինչ չի ցուցադրում։
 */
export function PrivateChatPresence() {
  const chat = (useRouteLoaderData("root") as { privateChat?: { unread: number; side: ChatSide } | null } | undefined)?.privateChat ?? null;
  const onChatPage = useLocation().pathname === "/namak";
  const unread = useRef(chat?.unread ?? 0);
  const publish = (next: (value: number) => number) => {
    const result = Math.max(0, next(unread.current));
    unread.current = result;
    window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: result }));
  };
  useChatSocket("app", Boolean(chat) && !onChatPage, (event) => {
    if (event.type === "lite") publish(() => event.unread);
    else if (event.type === "message" && chat && event.message.side !== chat.side) publish((value) => value + 1);
    else if ((event.type === "read" && event.side === chat?.side) || event.type === "cleared") publish(() => 0);
  });
  return null;
}
