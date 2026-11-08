import { DurableObject } from "cloudflare:workers";

import { pushKeysFrom, sendWebPush, type PushSubscriptionRow } from "../app/data/web-push.server";
import {
  BG_OPACITY_DEFAULT, FONT_DEFAULT, PAGE_SIZE, clampFont, clampOpacity, otherSide, parseClientEvent, statusOf,
  type ChatKind, type ChatMessage, type ChatMeta, type ChatPresence, type ChatSettings, type ChatSide, type ChatStatus, type ChatWhere, type ServerEvent,
} from "../app/utils/private-chat";
import { parseLetter } from "../app/utils/private-letter";

type ChatEnv = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  PUBLIC_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
};

/** Ամեն socket-ին կցված. ով է, որտեղ է (չատում թե կայքի այլ էջում) և արդյոք էջը էկրանին է։ */
type Attachment = { side: ChatSide; userId: string; visible: boolean; where: ChatWhere };

type Row = {
  id: number; side: string; body: string; at: number; deleted: number; kind: string; file_id: number | null; meta: string | null; edited_at: number | null;
  reply_to: number | null; r_side: string | null; r_body: string | null; r_kind: string | null; r_deleted: number | null;
};
/** Նամակը՝ իր պատասխանած նամակի կարճ տեքստով (reply)։ */
const SELECT = `SELECT m.id, m.side, m.body, m.at, m.deleted, m.kind, m.file_id, m.meta, m.edited_at, m.reply_to,
  r.side AS r_side, substr(r.body, 1, 200) AS r_body, r.kind AS r_kind, r.deleted AS r_deleted
  FROM messages AS m LEFT JOIN messages AS r ON r.id = m.reply_to`;
const kindOf = (kind: string | null) => (kind === "image" || kind === "audio" ? kind : "text");
function toMessage(row: Row): ChatMessage {
  let meta: ChatMeta | null = null;
  try { meta = row.meta ? JSON.parse(row.meta) as ChatMeta : null; } catch { meta = null; }
  const deleted = row.deleted === 1;
  return {
    id: row.id, side: row.side === "a" ? "a" : "b", body: deleted ? "" : row.body, at: row.at, deleted,
    kind: kindOf(row.kind),
    fileId: deleted ? null : row.file_id, meta: deleted ? null : meta, editedAt: row.edited_at,
    replyTo: row.reply_to && row.r_side && !deleted
      ? { id: row.reply_to, side: row.r_side === "a" ? "a" : "b", kind: kindOf(row.r_kind), body: row.r_deleted ? "" : row.r_body ?? "", deleted: row.r_deleted === 1 }
      : null,
  };
}

/** Telegram-ում ուղարկված ծանուցումները, որ կարդալուց հետո ջնջվեն։ */
type Sent = { chat: number; message: number };
/** Ֆայլը պահվում է 1 ՄԲ կտորներով (SQLite-ի մեկ արժեքի սահմանը 2 ՄԲ է)։ */
const CHUNK = 1024 * 1024;

/**
 * Անձնական չատը (/namak)։ Մեկ օրինակ («main»)։ Հաղորդագրությունները, նկարները և ձայնագրությունները պահվում են
 * միայն այստեղ (Durable Object-ի իր SQLite-ում), ոչ թե D1-ում կամ R2-ում. ուստի դրանք չկան ոչ backup-ում,
 * ոչ ադմինի էջերում, ոչ հանրային հասցեով։ Ով է մտնում՝ ստուգում է Worker-ը (app/data/private-chat.server.ts)։
 * Hibernation. socket-ները բաց են մնում, իսկ օբյեկտը քնում է, երբ ոչինչ չի կատարվում (անվճար պլան)։
 */
export class ChatRoom extends DurableObject<ChatEnv> {
  private sql: SqlStorage;
  /** Շատ արագ ուղարկելու սահմանը՝ ամեն կողմի վերջին ուղարկումների ժամերը (հիշողությունում)։ */
  private recent = new Map<ChatSide, number[]>();

  constructor(ctx: DurableObjectState, env: ChatEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, side TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, client_id TEXT)`);
    // Նոր սյուները (նկար, ձայն, փոփոխում). առաջին տարբերակի աղյուսակում դրանք չկային։
    for (const column of ["kind TEXT NOT NULL DEFAULT 'text'", "file_id INTEGER", "meta TEXT", "edited_at INTEGER", "reply_to INTEGER"]) {
      try { this.sql.exec(`ALTER TABLE messages ADD COLUMN ${column}`); } catch { /* արդեն կա */ }
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS members (
      user_id TEXT PRIMARY KEY, side TEXT NOT NULL, telegram_id TEXT, name TEXT NOT NULL DEFAULT '', seen_at INTEGER NOT NULL)`);
    this.sql.exec("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, mime TEXT NOT NULL, size INTEGER NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS file_chunks (file_id INTEGER NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_id, part))");
    // «ping»-ին պատասխանում է առանց օբյեկտը արթնացնելու։
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Socket-ի բացումը. կողմը և հաշիվը դնում է Worker-ը ստուգելուց հետո։ «lite»՝ կայքի մյուս էջերից (լույսի և ✉-ի համար)։ */
  async fetch(request: Request) {
    const side = request.headers.get("X-Chat-Side");
    const userId = request.headers.get("X-Chat-User");
    if ((side !== "a" && side !== "b") || !userId || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Not found.", { status: 404 });
    }
    const where: ChatWhere = request.headers.get("X-Chat-Where") === "app" ? "app" : "chat";
    const telegramId = request.headers.get("X-Chat-Telegram") || null;
    const name = decodeURIComponent(request.headers.get("X-Chat-Name") ?? "").slice(0, 80);
    this.sql.exec(
      `INSERT INTO members (user_id, side, telegram_id, name, seen_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET side = excluded.side, telegram_id = excluded.telegram_id, name = excluded.name, seen_at = excluded.seen_at`,
      userId, side, telegramId, name, Date.now(),
    );

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [side]);
    server.serializeAttachment({ side, userId, visible: true, where } satisfies Attachment);
    server.send(JSON.stringify(where === "chat" ? this.initFor(side) : { type: "lite", unread: this.unreadOf(side), presence: this.presenceOf(otherSide(side)) } satisfies ServerEvent));
    this.presenceChanged(side);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Չկարդացվածների թիվը (մենյուի կետի համար)։ */
  async unread(side: ChatSide) {
    return this.unreadOf(side);
  }

  /** Քանի չջնջված հաղորդագրություն կա (ստացողին փոխելուց առաջ). ջնջվածների պարունակությունն արդեն չկա։ */
  /**
   * Ստացողը փոխվել է. նախկին ստացողի բաց էջերը փակվում են, նրա հաշիվները և «վերջին անգամ»-ը
   * մոռացվում են, որ ոչ նամակ, ոչ ծանուցում նրան այլևս չհասնի։
   */
  async resetRecipient(keepIds: string[]) {
    for (const socket of this.ctx.getWebSockets("b")) {
      const me = socket.deserializeAttachment() as Attachment | null;
      if (me && keepIds.includes(me.userId)) continue;
      try { socket.close(4001, "recipient changed"); } catch { /* արդեն փակ է */ }
    }
    const marks = keepIds.length ? keepIds.map(() => "?").join(",") : "''";
    const removed = this.sql.exec(`DELETE FROM members WHERE side = 'b' AND user_id NOT IN (${marks})`, ...keepIds).rowsWritten;
    // Ոչ ոք չի հեռացվել (նույն ստացողը նորից է պահվել). նրա կարգավորումներն ու «վերջին անգամ»-ը մնում են։
    if (!removed) return;
    for (const key of ["seen_b", "status_b", "read_b", "nick_b", "font_b", "bgop_b"]) this.setState(key, null);
    const background = Number(this.getState("bg_b") ?? 0);
    this.setState("bg_b", null);
    if (background) this.removeFile(background);
    await this.clearNotifications("b");
    this.sendTo("a", { type: "presence", presence: this.presenceOf("b") });
  }

  async messageCount() {
    return this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM messages WHERE deleted = 0").one().count;
  }

  /** Նկար կամ ձայնագրություն. Worker-ը արդեն ստուգել է կողմը, տեսակը և չափը։ */
  async addFile(side: ChatSide, kind: Exclude<ChatKind, "text">, mime: string, data: ArrayBuffer, meta: ChatMeta, clientId: string, replyTo: number | null = null) {
    if (this.tooFast(side)) return { error: "Շատ արագ է, մի պահ սպասեք։" };
    const existing = this.byClientId(clientId, side);
    if (existing) return { message: existing };
    const fileId = this.storeFile(mime, data);
    const id = this.sql.exec<{ id: number }>(
      "INSERT INTO messages (side, body, at, client_id, kind, file_id, meta, reply_to) VALUES (?, '', ?, ?, ?, ?, ?, ?) RETURNING id",
      side, Date.now(), clientId || null, kind, fileId, JSON.stringify(meta), this.replyTarget(replyTo),
    ).one().id;
    const message = this.messageById(id)!;
    this.delivered(side, message, clientId);
    return { message };
  }

  /** Իր ֆոնի նկարը (ընդհանուրի փոխարեն). նախորդը ջնջվում է։ */
  async setBackground(side: ChatSide, mime: string, data: ArrayBuffer) {
    const fileId = this.storeFile(mime, data);
    const previous = Number(this.getState(`bg_${side}`) ?? 0);
    this.setState(`bg_${side}`, String(fileId));
    if (previous) this.removeFile(previous);
    this.sendTo(side, { type: "settings", settings: this.settingsOf(side) });
    return { background: fileId };
  }

  /** Ֆոնը. իրը, իսկ չունենալու դեպքում null (Worker-ը տալիս է ընդհանուրը)։ */
  async getBackground(side: ChatSide) {
    const id = Number(this.getState(`bg_${side}`) ?? 0);
    return id ? this.readFile(id) : null;
  }

  /** Ֆայլը՝ միայն եթե դրա հաղորդագրությունը ջնջված չէ (ֆոները՝ /namak/background-ով, ոչ այստեղից)։ */
  async getFile(id: number) {
    const linked = this.sql.exec<{ id: number }>("SELECT id FROM messages WHERE file_id = ? AND deleted = 0", id).toArray()[0];
    return linked ? this.readFile(id) : null;
  }

  private storeFile(mime: string, data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    const fileId = this.sql.exec<{ id: number }>("INSERT INTO files (mime, size) VALUES (?, ?) RETURNING id", mime, bytes.byteLength).one().id;
    for (let part = 0; part * CHUNK < bytes.byteLength; part += 1) {
      this.sql.exec("INSERT INTO file_chunks (file_id, part, data) VALUES (?, ?, ?)", fileId, part, bytes.slice(part * CHUNK, (part + 1) * CHUNK).buffer);
    }
    return fileId;
  }

  private readFile(id: number) {
    const file = this.sql.exec<{ mime: string; size: number }>("SELECT mime, size FROM files WHERE id = ?", id).toArray()[0];
    if (!file) return null;
    const bytes = new Uint8Array(file.size);
    let offset = 0;
    for (const chunk of this.sql.exec<{ data: ArrayBuffer }>("SELECT data FROM file_chunks WHERE file_id = ? ORDER BY part", id)) {
      const part = new Uint8Array(chunk.data);
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return { mime: file.mime, data: bytes.buffer };
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    const event = parseClientEvent(typeof data === "string" ? data : null);
    const me = socket.deserializeAttachment() as Attachment | null;
    if (!event || !me) return;
    const side = me.side;
    switch (event.type) {
      case "send": {
        if (this.tooFast(side)) { socket.send(JSON.stringify({ type: "error", message: "Շատ արագ է, մի պահ սպասեք։" } satisfies ServerEvent)); return; }
        // Կապը կտրվելուց հետո բրաուզերը նորից է ուղարկում. նույն clientId-ով երկրորդ անգամ չի պահվում։
        const existing = this.byClientId(event.clientId, side);
        if (existing) { socket.send(JSON.stringify({ type: "message", message: existing, clientId: event.clientId } satisfies ServerEvent)); return; }
        const id = this.sql.exec<{ id: number }>(
          "INSERT INTO messages (side, body, at, client_id, reply_to) VALUES (?, ?, ?, ?, ?) RETURNING id",
          side, event.text, Date.now(), event.clientId || null, this.replyTarget(event.replyTo),
        ).one().id;
        this.delivered(side, this.messageById(id)!, event.clientId);
        return;
      }
      case "edit": {
        const changed = this.sql.exec(
          "UPDATE messages SET body = ?, edited_at = ? WHERE id = ? AND side = ? AND deleted = 0 AND kind = 'text'",
          event.text, Date.now(), event.id, side,
        ).rowsWritten;
        const message = changed ? this.messageById(event.id) : null;
        if (message) this.broadcast({ type: "edited", message });
        return;
      }
      case "read": {
        const last = this.sql.exec<{ id: number | null }>("SELECT MAX(id) AS id FROM messages").one().id ?? 0;
        const upTo = Math.min(event.upTo, last);
        if (upTo <= this.readOf(side)) return;
        this.setState(`read_${side}`, String(upTo));
        this.broadcast({ type: "read", side, upTo });
        this.ctx.waitUntil(this.clearNotifications(side));
        return;
      }
      case "typing": this.sendTo(otherSide(side), { type: "typing" }); return;
      case "where":
        socket.serializeAttachment({ ...me, where: event.where, visible: event.visible } satisfies Attachment);
        this.presenceChanged(side);
        return;
      case "history": {
        const rows = this.sql.exec<Row>(`${SELECT} WHERE m.id < ? ORDER BY m.id DESC LIMIT ?`, event.before, PAGE_SIZE + 1).toArray();
        socket.send(JSON.stringify({ type: "history", messages: rows.slice(0, PAGE_SIZE).reverse().map(toMessage), hasMore: rows.length > PAGE_SIZE } satisfies ServerEvent));
        return;
      }
      case "delete": {
        // Միայն իր հաղորդագրությունը. տեքստը և ֆայլը իսկապես ջնջվում են, մնում է միայն «ջնջված» նշանը։
        const row = this.sql.exec<{ file_id: number | null }>("UPDATE messages SET body = '', meta = NULL, deleted = 1 WHERE id = ? AND side = ? AND deleted = 0 RETURNING file_id", event.id, side).toArray()[0];
        if (!row) return;
        if (row.file_id) this.removeFile(row.file_id);
        this.sql.exec("UPDATE messages SET file_id = NULL WHERE id = ?", event.id);
        this.broadcast({ type: "deleted", id: event.id });
        return;
      }
      case "settings": {
        this.setState(`nick_${side}`, event.nick);
        this.setState(`font_${side}`, String(event.font));
        this.setState(`bgop_${side}`, String(event.bgOpacity));
        this.sendTo(side, { type: "settings", settings: this.settingsOf(side) });
        return;
      }
      case "background-reset": {
        const previous = Number(this.getState(`bg_${side}`) ?? 0);
        this.setState(`bg_${side}`, null);
        if (previous) this.removeFile(previous);
        this.sendTo(side, { type: "settings", settings: this.settingsOf(side) });
        return;
      }
      case "clear": {
        // Ամբողջ զրույցը՝ միայն տերը։ Մնում են միայն կարգավորումները (անուններ, տեքստի չափ)։
        if (side !== "a") return;
        // Ֆոները (իրենց կարգավորումն են) մնում են։
        const keep = ["a", "b"].map((each) => Number(this.getState(`bg_${each}`) ?? 0)).filter(Boolean);
        const marks = keep.length ? keep.join(",") : "0";
        this.sql.exec(`DELETE FROM file_chunks WHERE file_id NOT IN (${marks})`);
        this.sql.exec(`DELETE FROM files WHERE id NOT IN (${marks})`);
        this.sql.exec("DELETE FROM messages");
        this.sql.exec("DELETE FROM state WHERE key LIKE 'read_%'");
        for (const each of ["a", "b"] as const) this.ctx.waitUntil(this.clearNotifications(each));
        this.broadcast({ type: "cleared" });
        return;
      }
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const me = socket.deserializeAttachment() as Attachment | null;
    try { socket.close(code === 1005 ? 1000 : code, reason); } catch { /* արդեն փակ է */ }
    if (me) this.presenceChanged(me.side, socket);
  }

  async webSocketError(socket: WebSocket) {
    await this.webSocketClose(socket, 1011, "error");
  }

  /** Նոր հաղորդագրություն. բոլորին, և ծանուցում, եթե մյուսը հիմա չատին չի նայում։ */
  private delivered(side: ChatSide, message: ChatMessage, clientId: string) {
    this.broadcast({ type: "message", message, clientId });
    const other = otherSide(side);
    if (this.statusOf(other) !== "chat") this.ctx.waitUntil(this.notify(other).catch((error: unknown) => console.error("chat notify", error instanceof Error ? error.message : "failed")));
  }

  private messageById(id: number) {
    const row = this.sql.exec<Row>(`${SELECT} WHERE m.id = ?`, id).toArray()[0];
    return row ? toMessage(row) : null;
  }

  private byClientId(clientId: string, side: ChatSide) {
    if (!clientId) return null;
    const row = this.sql.exec<Row>(`${SELECT} WHERE m.client_id = ? AND m.side = ?`, clientId, side).toArray()[0];
    return row ? toMessage(row) : null;
  }

  /** Պատասխանը՝ միայն գոյություն ունեցող, չջնջված նամակին։ */
  private replyTarget(id: number | null | undefined) {
    if (!id) return null;
    return this.sql.exec<{ id: number }>("SELECT id FROM messages WHERE id = ? AND deleted = 0", id).toArray()[0]?.id ?? null;
  }

  private removeFile(id: number) {
    this.sql.exec("DELETE FROM file_chunks WHERE file_id = ?", id);
    this.sql.exec("DELETE FROM files WHERE id = ?", id);
  }

  private initFor(side: ChatSide): ServerEvent {
    const rows = this.sql.exec<Row>(`${SELECT} ORDER BY m.id DESC LIMIT ?`, PAGE_SIZE + 1).toArray();
    const names: Partial<Record<ChatSide, string>> = {};
    for (const row of this.sql.exec<{ side: string; name: string }>("SELECT side, name FROM members WHERE name != '' ORDER BY seen_at").toArray()) {
      names[row.side === "a" ? "a" : "b"] = row.name;
    }
    return {
      type: "init",
      side,
      messages: rows.slice(0, PAGE_SIZE).reverse().map(toMessage),
      hasMore: rows.length > PAGE_SIZE,
      read: { a: this.readOf("a"), b: this.readOf("b") },
      presence: this.presenceOf(otherSide(side)),
      names,
      settings: this.settingsOf(side),
    };
  }

  private unreadOf(side: ChatSide) {
    return this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM messages WHERE side != ? AND deleted = 0 AND id > ?", side, this.readOf(side)).one().count;
  }

  private settingsOf(side: ChatSide): ChatSettings {
    return {
      nick: this.getState(`nick_${side}`) ?? "",
      font: clampFont(Number(this.getState(`font_${side}`) ?? FONT_DEFAULT)),
      bgOpacity: clampOpacity(Number(this.getState(`bgop_${side}`) ?? BG_OPACITY_DEFAULT)),
      background: Number(this.getState(`bg_${side}`) ?? 0) || null,
    };
  }

  private socketsOf(side: ChatSide, except?: WebSocket) {
    return this.ctx.getWebSockets(side).filter((socket) => socket !== except)
      .map((socket) => socket.deserializeAttachment() as Attachment | null)
      .filter((value): value is Attachment => Boolean(value));
  }

  private statusOf(side: ChatSide, except?: WebSocket): ChatStatus {
    return statusOf(this.socketsOf(side, except));
  }

  private presenceOf(side: ChatSide, except?: WebSocket): ChatPresence {
    const status = this.statusOf(side, except);
    return { status, lastSeen: status === "away" ? Number(this.getState(`seen_${side}`) ?? 0) || null : null };
  }

  /** Այս կողմի վիճակը փոխվե՞լ է. եթե այո, մյուսին հայտնել (փակելիս՝ «վերջին անգամ»-ը պահել)։ */
  private presenceChanged(side: ChatSide, closing?: WebSocket) {
    const status = this.statusOf(side, closing);
    if (this.getState(`status_${side}`) === status) return;
    if (status === "away") this.setState(`seen_${side}`, String(Date.now()));
    this.setState(`status_${side}`, status);
    this.sendTo(otherSide(side), { type: "presence", presence: this.presenceOf(side, closing) });
  }

  private readOf(side: ChatSide) {
    return Number(this.getState(`read_${side}`) ?? 0) || 0;
  }

  private getState(key: string) {
    return this.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = ?", key).toArray()[0]?.value ?? null;
  }

  private setState(key: string, value: string | null) {
    if (value === null) this.sql.exec("DELETE FROM state WHERE key = ?", key);
    else this.sql.exec("INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
  }

  private broadcast(event: ServerEvent) {
    const text = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) { try { socket.send(text); } catch { /* փակվում է */ } }
  }

  private sendTo(side: ChatSide, event: ServerEvent) {
    const text = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets(side)) { try { socket.send(text); } catch { /* փակվում է */ } }
  }

  private tooFast(side: ChatSide) {
    const now = Date.now();
    const times = (this.recent.get(side) ?? []).filter((time) => now - time < 10_000);
    times.push(now);
    this.recent.set(side, times);
    return times.length > 20;
  }

  /** Այս կողմի բոլոր հաշիվները. մտածները (members) և ստացողի համար՝ նաև կարգավորման id-ները։ */
  private async accountsOf(side: ChatSide) {
    const ids = new Set(this.sql.exec<{ user_id: string }>("SELECT user_id FROM members WHERE side = ?", side).toArray().map((row) => row.user_id));
    if (side === "b") {
      const row = await this.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'private_letter'").first<{ value: string }>().catch(() => null);
      for (const id of parseLetter(row?.value).recipientIds) ids.add(id);
    }
    return [...ids].slice(0, 20);
  }

  /**
   * Ծանուցում՝ առանց ձայնի և առանց տեքստի (ոչ ոք չի տեսնի, թե ինչ է գրված կամ ումից է)։
   * Մեկ անգամ՝ մինչև կարդալը. մյուս հաղորդագրությունները նոր ծանուցում չեն ուղարկում։
   */
  private async notify(side: ChatSide) {
    if (this.getState(`notified_${side}`) !== null) return;
    this.setState(`notified_${side}`, "[]");
    const ids = await this.accountsOf(side);
    if (!ids.length) return;
    const marks = ids.map(() => "?").join(",");
    const site = (this.env.PUBLIC_URL ?? "https://apostolic.am").replace(/\/$/u, "");

    const keys = pushKeysFrom(this.env);
    if (keys) {
      const { results } = await this.env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${marks})`).bind(...ids).all<PushSubscriptionRow>();
      for (const subscription of results) {
        const outcome = await sendWebPush(subscription, { kind: "quiet", title: "Հոգևոր ժառանգություն", body: "Նոր ծանուցում", url: "/namak", tag: "quiet" }, keys).catch(() => "failed" as const);
        if (outcome === "gone") await this.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      }
    }

    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const people = await this.env.DB.prepare(`SELECT DISTINCT telegram_id FROM app_users WHERE id IN (${marks})`).bind(...ids).all<{ telegram_id: string }>();
    const sent: Sent[] = [];
    for (const { telegram_id: chat } of people.results) {
      if (!/^\d+$/u.test(chat)) continue;
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chat),
          text: "🔔 Նոր ծանուցում",
          disable_notification: true,
          protect_content: true,
          reply_markup: { inline_keyboard: [[{ text: "Բացել", web_app: { url: `${site}/namak` } }]] },
        }),
      }).catch(() => null);
      const body = await response?.json<{ ok?: boolean; result?: { message_id?: number } }>().catch(() => null);
      if (body?.ok && body.result?.message_id) sent.push({ chat: Number(chat), message: body.result.message_id });
    }
    this.setState(`notified_${side}`, JSON.stringify(sent));
  }

  /** Կարդալուց հետո Telegram-ի ծանուցումը ջնջվում է, և հաջորդ նոր հաղորդագրությունը նորից կծանուցի։ */
  private async clearNotifications(side: ChatSide) {
    const value = this.getState(`notified_${side}`);
    if (value === null) return;
    this.setState(`notified_${side}`, null);
    const token = this.env.TELEGRAM_BOT_TOKEN;
    let sent: Sent[] = [];
    try { sent = JSON.parse(value) as Sent[]; } catch { sent = []; }
    if (!token) return;
    for (const item of sent) {
      await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: item.chat, message_id: item.message }),
      }).catch(() => null);
    }
  }
}
