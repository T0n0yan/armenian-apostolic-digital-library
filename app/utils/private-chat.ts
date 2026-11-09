/**
 * Անձնական չատ (/namak). միայն երկու կողմ՝ «a» (տերը) և «b» (ստացողը)։
 * Socket-ի հաղորդագրությունների ձևը՝ սերվերի (workers/chat-room.ts) և էջի համար ընդհանուր։
 */
export type ChatSide = "a" | "b";
export type ChatKind = "text" | "image" | "audio";
/** 🟢 չատում է, 🟡 կայքում է (ուրիշ էջում), 🔴 փակել է։ */
export type ChatStatus = "chat" | "app" | "away";
export type ChatWhere = "chat" | "app";

export type ChatMeta = { w?: number; h?: number; duration?: number };
/** Այն նամակը, որին պատասխանում են (կարճ տեքստով)։ */
export type ChatReply = { id: number; side: ChatSide; kind: ChatKind; body: string; deleted: boolean };
export type ChatMessage = {
  id: number; side: ChatSide; body: string; at: number; deleted: boolean;
  kind: ChatKind; fileId: number | null; meta: ChatMeta | null; editedAt: number | null;
  replyTo: ChatReply | null;
};
export type ChatPresence = { status: ChatStatus; lastSeen: number | null };
/** Ամեն կողմի իր կարգավորումը. ինչպես է անվանում մյուսին և տեքստի չափը։ */
export type ChatSettings = {
  nick: string; font: number;
  /** Ֆոնի նկարը որքան երևա (0.05–0.8)։ background՝ իր նկարի համարը, null՝ ընդհանուր (տիրոջ ընտրած) ֆոնը։ */
  bgOpacity: number; background: number | null;
  /** Միայն տիրոջ համար. ծանուցել, երբ մյուսը բացում է կայքը։ */
  notifyPresence: boolean;
};

/** Բրաուզերից սերվեր։ */
export type ClientEvent =
  | { type: "send"; text: string; clientId: string; replyTo?: number }
  | { type: "edit"; id: number; text: string }
  | { type: "read"; upTo: number }
  | { type: "typing" }
  | { type: "where"; where: ChatWhere; visible: boolean }
  | { type: "history"; before: number }
  | { type: "delete"; id: number }
  | { type: "settings"; nick: string; font: number; bgOpacity: number; notifyPresence: boolean }
  | { type: "background-reset" }
  | { type: "clear" };

/** Սերվերից բրաուզեր։ */
export type ServerEvent =
  | { type: "init"; side: ChatSide; messages: ChatMessage[]; hasMore: boolean; read: Record<ChatSide, number>; presence: ChatPresence; names: Partial<Record<ChatSide, string>>; settings: ChatSettings }
  | { type: "lite"; unread: number; presence: ChatPresence }
  | { type: "message"; message: ChatMessage; clientId?: string }
  | { type: "edited"; message: ChatMessage }
  | { type: "history"; messages: ChatMessage[]; hasMore: boolean }
  | { type: "read"; side: ChatSide; upTo: number }
  | { type: "typing" }
  | { type: "presence"; presence: ChatPresence }
  | { type: "deleted"; id: number }
  | { type: "settings"; settings: ChatSettings }
  | { type: "cleared" }
  | { type: "error"; message: string };

export const MESSAGE_MAX = 50_000;
export const NICK_MAX = 40;
export const FONT_MIN = 13;
export const FONT_MAX = 24;
export const FONT_DEFAULT = 15.5;
export const BG_OPACITY_DEFAULT = 0.22;
export const PAGE_SIZE = 60;
/** «Նա կայքում է» ծանուցումը՝ ոչ ավելի հաճախ, և միայն եթե նա առնվազն այսքան բացակա էր (վերամիացումները չեն հաշվվում)։ */
export const PRESENCE_NOTIFY_EVERY_MS = 20 * 60_000;
export const PRESENCE_AWAY_MIN_MS = 3 * 60_000;

/** Ծանուցե՞լ տիրոջը, որ մյուսը եկավ. միայն «փակ»-ից, երկար բացակայությունից հետո և ոչ շատ հաճախ։ */
export function shouldNotifyPresence(previous: string | null, next: string, awaySince: number | null, lastNotified: number | null, now = Date.now()) {
  if (previous !== "away" || next === "away") return false;
  if (awaySince && now - awaySince < PRESENCE_AWAY_MIN_MS) return false;
  return !lastNotified || now - lastNotified >= PRESENCE_NOTIFY_EVERY_MS;
}
export const FILE_MAX = 10 * 1024 * 1024;
export const CHAT_SOCKET_PATH = "/namak/socket";
export const CHAT_UPLOAD_PATH = "/namak/upload";
export const chatFileUrl = (id: number) => `/namak/file/${id}`;
export const CHAT_BACKGROUND_PATH = "/namak/background";

/** Միայն այս ձևաչափերը (SVG-ն և HTML-ը՝ ոչ, որ ֆայլը script չդառնա)։ */
const MIME: Record<"image" | "audio", RegExp> = {
  image: /^image\/(jpeg|png|webp|gif)$/u,
  audio: /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)$/u,
};
export function allowedMime(kind: string, mime: string) {
  const base = mime.split(";")[0].trim().toLowerCase();
  const type = kind === "background" ? "image" : kind;
  return (type === "image" || type === "audio") && MIME[type].test(base) ? base : null;
}

export const otherSide = (side: ChatSide): ChatSide => (side === "a" ? "b" : "a");
export const clampOpacity = (value: unknown) => {
  const opacity = typeof value === "number" && Number.isFinite(value) ? value : BG_OPACITY_DEFAULT;
  return Math.min(0.8, Math.max(0.05, Math.round(opacity * 100) / 100));
};
export const clampFont = (value: unknown) => {
  const size = typeof value === "number" && Number.isFinite(value) ? value : FONT_DEFAULT;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size * 2) / 2));
};

/** Տեքստը՝ առանց եզրերի բացատների և կառավարող նշանների, առավելագույնը MESSAGE_MAX։ */
export function cleanMessage(text: unknown, max = MESSAGE_MAX) {
  if (typeof text !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/gu, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/gu, "").trim().slice(0, max);
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
      if (!text) return null;
      return id("replyTo") ? { type: "send", text, clientId, replyTo: id("replyTo")! } : { type: "send", text, clientId };
    }
    case "edit": {
      const text = cleanMessage(value.text);
      return text && id("id") !== null ? { type: "edit", id: id("id")!, text } : null;
    }
    case "read": return id("upTo") === null ? null : { type: "read", upTo: id("upTo")! };
    case "typing": return { type: "typing" };
    // «visible»՝ նախորդ տարբերակի էջերի համար (չատում էին)։
    case "visible": return { type: "where", where: "chat", visible: value.visible === true };
    case "where": return { type: "where", where: value.where === "chat" ? "chat" : "app", visible: value.visible === true };
    case "history": return id("before") === null ? null : { type: "history", before: id("before")! };
    case "delete": return id("id") === null ? null : { type: "delete", id: id("id")! };
    case "settings": return { type: "settings", nick: cleanMessage(value.nick, NICK_MAX).replace(/\n/gu, " "), font: clampFont(value.font), bgOpacity: clampOpacity(value.bgOpacity), notifyPresence: value.notifyPresence !== false };
    case "background-reset": return { type: "background-reset" };
    case "clear": return { type: "clear" };
    default: return null;
  }
}

/** Մյուսի վիճակը նրա socket-ներից. չատում (էկրանին) → կայքում (էկրանին) → փակ։ */
export function statusOf(sockets: { where: ChatWhere; visible: boolean }[]): ChatStatus {
  if (sockets.some((socket) => socket.visible && socket.where === "chat")) return "chat";
  if (sockets.some((socket) => socket.visible)) return "app";
  return "away";
}

/** Իմ հաղորդագրության նշանը. ✓ (ուղարկված), ✓✓ (կարդացել է)։ */
export function messageTicks(message: { id: number }, otherRead: number): "sent" | "read" {
  return message.id <= otherRead ? "read" : "sent";
}

/** Քանի չկարդացված հաղորդագրություն ունի այս կողմը։ */
export function unreadCount(messages: Pick<ChatMessage, "id" | "side" | "deleted">[], side: ChatSide, myRead: number) {
  return messages.filter((message) => message.side !== side && !message.deleted && message.id > myRead).length;
}
