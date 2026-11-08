import { env } from "cloudflare:workers";

import { accountList, isOwnerIdentity, linkedAliases } from "../auth/admin.server";
import { getOptionalTelegramUser, type TelegramUserIdentity } from "../auth/telegram-user.server";
import { FILE_MAX, allowedMime, type ChatMeta, type ChatSide } from "../utils/private-chat";
import { DEFAULT_BACKGROUND_BASE64, DEFAULT_BACKGROUND_MIME } from "./private-chat-background.server";
import { getPrivateLetter } from "./private-letter.server";

type ChatNamespace = DurableObjectNamespace<import("../../workers/chat-room").ChatRoom>;

/**
 * Ով կարող է մտնել չատ. «a»՝ միայն CHAT_OWNER_ACCOUNTS-ի (կամ OWNER_ACCOUNTS-ի) հաշիվները կամ դրանց կապվածները (ոչ թե ցանկացած ադմին կամ
 * «գլխավոր ադմին» դարձված մարդ), «b»՝ միայն ստացողի պահված id-ները։ Մնացած բոլորը՝ null։
 */
export async function chatParticipant(request: Request): Promise<{ side: ChatSide; user: TelegramUserIdentity } | null> {
  const user = await getOptionalTelegramUser(request);
  if (!user) return null;
  // CHAT_OWNER_ACCOUNTS (wrangler.jsonc)՝ միայն տիրոջ հաշիվները. production-ում OWNER_ACCOUNTS չկա
  // (այնտեղ գլխավոր ադմինը բազայից է), իսկ բազայի «գլխավոր ադմին»-ը ուրիշին էլ կարող է տրվել։
  const owners = accountList("CHAT_OWNER_ACCOUNTS");
  if (user.source === "local-development" || await isOwnerIdentity(request, env.DB, user, owners.length ? owners : accountList("OWNER_ACCOUNTS"))) return { side: "a", user };
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
  headers.set("X-Chat-Where", new URL(request.url).searchParams.get("where") === "app" ? "app" : "chat");
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

const fileHeaders = (extra: Record<string, string>) => new Headers({
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  // Ուրիշ կայքը չի կարող այս ֆայլը ներդնել (img/audio) նույնիսկ մեր cookie-ով։
  "Cross-Origin-Resource-Policy": "same-origin",
  ...extra,
});

/** Նկար/ձայն ուղարկել (POST /namak/upload). միայն կողմերը, նույն կայքից, թույլատրված ձևաչափ, ≤ 10 ՄԲ։ */
export async function uploadChatFile(request: Request) {
  const notFound = new Response("Not found.", { status: 404 });
  if (request.method !== "POST") return notFound;
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden.", { status: 403 });
  const who = await chatParticipant(request);
  const room = chatRoom();
  if (!who || !room) return notFound;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const mime = allowedMime(kind ?? "", request.headers.get("Content-Type") ?? "");
  if ((kind !== "image" && kind !== "audio" && kind !== "background") || !mime) return new Response("Unsupported.", { status: 415 });
  if (Number(request.headers.get("Content-Length") ?? 0) > FILE_MAX) return new Response("Too large.", { status: 413 });
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > FILE_MAX) return new Response("Too large.", { status: 413 });
  if (kind === "background") return Response.json(await room.setBackground(who.side, mime, data), { headers: fileHeaders({}) });
  const number = (key: string) => { const value = Number(url.searchParams.get(key)); return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : undefined; };
  const meta: ChatMeta = { w: number("w"), h: number("h"), duration: number("duration") };
  const result = await room.addFile(who.side, kind, mime, data, meta, (url.searchParams.get("clientId") ?? "").slice(0, 40));
  return Response.json(result, { status: "error" in result ? 429 : 200, headers: fileHeaders({}) });
}

/** Ֆայլը (GET /namak/file/:id). միայն կողմերին, Range-ով (Safari-ն ձայնը առանց դրա չի նվագում)։ */
export async function readChatFile(request: Request, id: number) {
  const notFound = new Response("Not found.", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") return notFound;
  const who = await chatParticipant(request);
  const room = chatRoom();
  if (!who || !room) return notFound;
  const file = await room.getFile(id);
  if (!file) return notFound;
  const bytes = new Uint8Array(file.data);
  const range = /^bytes=(\d*)-(\d*)$/u.exec(request.headers.get("Range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: fileHeaders({ "Content-Range": `bytes */${size}` }) });
    return new Response(request.method === "HEAD" ? null : bytes.slice(start, end + 1), {
      status: 206,
      headers: fileHeaders({ "Content-Type": file.mime, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" }),
    });
  }
  return new Response(request.method === "HEAD" ? null : bytes, { headers: fileHeaders({ "Content-Type": file.mime, "Content-Length": String(bytes.byteLength), "Accept-Ranges": "bytes" }) });
}

let defaultBackground: Uint8Array<ArrayBuffer> | null = null;

/** Ֆոնը (GET /namak/background). իր ընտրածը, իսկ չունենալու դեպքում՝ ընդհանուրը։ Միայն կողմերին։ */
export async function readChatBackground(request: Request) {
  const notFound = new Response("Not found.", { status: 404 });
  if (request.method !== "GET") return notFound;
  const who = await chatParticipant(request);
  const room = chatRoom();
  if (!who || !room) return notFound;
  const own = await room.getBackground(who.side);
  if (own) return new Response(own.data, { headers: fileHeaders({ "Content-Type": own.mime }) });
  defaultBackground ??= Uint8Array.from(atob(DEFAULT_BACKGROUND_BASE64), (character) => character.charCodeAt(0));
  return new Response(defaultBackground, { headers: fileHeaders({ "Content-Type": DEFAULT_BACKGROUND_MIME }) });
}
