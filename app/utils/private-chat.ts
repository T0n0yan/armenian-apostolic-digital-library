/**
 * Անձնական չատ (/namak). միայն երկու կողմ՝ «a» (տերը, OWNER_ACCOUNTS) և «b» (ստացողը)։
 * Socket-ի հաղորդագրությունների ձևը՝ սերվերի (workers/chat-room.ts) և էջի համար ընդհանուր։
 */
export type ChatSide = "a" | "b";

export type ChatMessage = { id: number; side: ChatSide; body: string; at: number; deleted: boolean };

/** Բրաուզերից սերվեր։ */
export type ClientEvent =
  | { type: "send"; text: string; clientId: string }
  | { type: "read"; upTo: number }
  | { type: "typing" }
  | { type: "visible"; visible: boolean }
  | { type: "history"; before: number }
  | { type: "delete"; id: number };

/** Սերվերից բրաուզեր։ */
export type ServerEvent =
  | { type: "init"; side: ChatSide; messages: ChatMessage[]; hasMore: boolean; read: Record<ChatSide, number>; online: boolean; names: Partial<Record<ChatSide, string>> }
  | { type: "message"; message: ChatMessage; clientId?: string }
  | { type: "history"; messages: ChatMessage[]; hasMore: boolean }
  | { type: "read"; side: ChatSide; upTo: number }
  | { type: "typing" }
  | { type: "presence"; online: boolean }
  | { type: "deleted"; id: number }
  | { type: "error"; message: string };

export const MESSAGE_MAX = 4000;
export const PAGE_SIZE = 60;
export const CHAT_SOCKET_PATH = "/namak/socket";

export const otherSide = (side: ChatSide): ChatSide => (side === "a" ? "b" : "a");

/** Տեքստը՝ առանց եզրերի բացատների և կառավարող նշանների, առավելագույնը MESSAGE_MAX։ */
export function cleanMessage(text: unknown) {
  if (typeof text !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/gu, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/gu, "").trim().slice(0, MESSAGE_MAX);
}

/** Բրաուզերից եկածը՝ միայն սպասվող ձևով, մնացածը՝ null։ */
export function parseClientEvent(raw: unknown): ClientEvent | null {
  if (typeof raw !== "string" || raw.length > MESSAGE_MAX * 8) return null;
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const id = (key: string) => (Number.isSafeInteger(value[key]) && (value[key] as number) >= 0 ? value[key] as number : null);
  switch (value.type) {
    case "send": {
      const text = cleanMessage(value.text);
      const clientId = typeof value.clientId === "string" ? value.clientId.slice(0, 40) : "";
      return text ? { type: "send", text, clientId } : null;
    }
    case "read": return id("upTo") === null ? null : { type: "read", upTo: id("upTo")! };
    case "typing": return { type: "typing" };
    case "visible": return { type: "visible", visible: value.visible === true };
    case "history": return id("before") === null ? null : { type: "history", before: id("before")! };
    case "delete": return id("id") === null ? null : { type: "delete", id: id("id")! };
    default: return null;
  }
}

/** Իմ հաղորդագրության նշանը. ժամացույց (դեռ չի ուղարկվել), ✓ (ուղարկված), ✓✓ (կարդացել է)։ */
export function messageTicks(message: { id: number }, otherRead: number): "sent" | "read" {
  return message.id <= otherRead ? "read" : "sent";
}

/** Քանի չկարդացված հաղորդագրություն ունի այս կողմը։ */
export function unreadCount(messages: ChatMessage[], side: ChatSide, myRead: number) {
  return messages.filter((message) => message.side !== side && !message.deleted && message.id > myRead).length;
}
