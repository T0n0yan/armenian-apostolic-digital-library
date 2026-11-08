import { env } from "cloudflare:workers";

import { isOwnerIdentity, linkedAliases } from "../auth/admin.server";
import { getOptionalTelegramUser, type TelegramUserIdentity } from "../auth/telegram-user.server";
import type { ChatSide } from "../utils/private-chat";
import { getPrivateLetter } from "./private-letter.server";

type ChatNamespace = DurableObjectNamespace<import("../../workers/chat-room").ChatRoom>;

/**
 * Ով կարող է մտնել չատ. «a»՝ միայն OWNER_ACCOUNTS-ի հաշիվները կամ դրանց կապվածները (ոչ թե ցանկացած ադմին կամ
 * «գլխավոր ադմին» դարձված մարդ), «b»՝ միայն ստացողի պահված id-ները։ Մնացած բոլորը՝ null։
 */
export async function chatParticipant(request: Request): Promise<{ side: ChatSide; user: TelegramUserIdentity } | null> {
  const user = await getOptionalTelegramUser(request);
  if (!user) return null;
  if (user.source === "local-development" || await isOwnerIdentity(request, env.DB, user)) return { side: "a", user };
  const letter = await getPrivateLetter(env.DB);
  if (!letter.recipientIds.length) return null;
  if (letter.recipientIds.includes(user.id)) return { side: "b", user };
  // Ստացողը հետագայում կարող է կապել իր հաշիվները. կապված հաշվով էլ նա նույն մարդն է։
  const aliases = await linkedAliases(request, env.DB, user.id);
  return aliases.some((alias) => letter.recipientIds.includes(alias.id)) ? { side: "b", user } : null;
}

export function chatRoom() {
  const namespace = (env as unknown as { CHAT?: ChatNamespace }).CHAT;
  return namespace ? namespace.get(namespace.idFromName("main")) : null;
}

/**
 * Socket-ի բացումը (/namak/socket)։ Ստուգվում է՝ նույն կայքից է (ուրիշ կայքը չի կարող բացել
 * մեր անունից), մուտք գործած է և չատի կողմ է։ Կողմը սերվերն է որոշում, բրաուզերից եկածը չի ընդունվում։
 */
export async function openChatSocket(request: Request) {
  const notFound = new Response("Not found.", { status: 404 });
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return notFound;
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden.", { status: 403 });
  const who = await chatParticipant(request);
  const room = chatRoom();
  if (!who || !room) return notFound;
  const headers = new Headers({ Upgrade: "websocket" });
  headers.set("X-Chat-Side", who.side);
  headers.set("X-Chat-User", who.user.id);
  headers.set("X-Chat-Name", encodeURIComponent(who.user.displayName.slice(0, 80)));
  if (/^\d+$/u.test(who.user.telegramId)) headers.set("X-Chat-Telegram", who.user.telegramId);
  return room.fetch(new Request("https://chat.internal/socket", { headers }));
}

/** Չկարդացվածների թիվը մենյուի համար. միայն կողմերին, մնացածին՝ null։ */
export async function chatUnread(side: ChatSide) {
  return (await chatRoom()?.unread(side).catch(() => 0)) ?? 0;
}
