// Keep the MTProto implementation behind one boundary so the rest of the
// Bridge is insulated from package-level API changes.
export { Api, Rich, TelegramClient, utils } from "teleproto";
export type { Entity } from "teleproto/define";
export { StringSession } from "teleproto/sessions";
export { DeletedMessage } from "teleproto/events";
export type { DeletedMessageEvent } from "teleproto/events";
export { Logger, LogLevel } from "teleproto/extensions/Logger.js";
