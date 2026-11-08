import { ArrowLeft, Bell, Check, CheckCheck, Clock3, Lock, SendHorizontal, Settings2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Form, Link, useNavigation } from "react-router";

import { fieldControl, fieldHint, fieldLabel } from "./ui-styles";
import { CHAT_SOCKET_PATH, MESSAGE_MAX, messageTicks, otherSide, type ChatMessage, type ChatSide, type ClientEvent, type ServerEvent } from "../utils/private-chat";
import { enablePushNotifications, pushSupport } from "../utils/web-push";

type Pending = { clientId: string; body: string; at: number };
type Status = "connecting" | "open" | "offline";

const MONTHS = ["հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի", "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի"];
const pad = (value: number) => String(value).padStart(2, "0");
const timeOf = (at: number) => { const date = new Date(at); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const dayKey = (at: number) => new Date(at).toDateString();
function dayLabel(at: number) {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Այսօր";
  if (date.toDateString() === yesterday.toDateString()) return "Երեկ";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${date.getFullYear() === today.getFullYear() ? "" : ` ${date.getFullYear()}`}`;
}

function merge(list: ChatMessage[], add: ChatMessage[]) {
  const byId = new Map(list.map((message) => [message.id, message]));
  for (const message of add) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

/** Էկրանի իրական բարձրությունը (հեռախոսի ստեղնաշարը բացվելիս փոքրանում է)։ */
function useViewportHeight() {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setHeight(viewport.height);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return height;
}

/**
 * Անձնական չատը։ Socket-ով. նոր նամակը, «գրում է…», «կարդացել է» (✓✓) և «առցանց»՝ միանգամից։
 * Ոչինչ չի պահվում բրաուզերում (localStorage չկա). էջը փակելուց հետո հեռախոսում ոչինչ չի մնում։
 */
export function PrivateChat({ side, recipient, actionData }: { side: ChatSide; recipient: string | null; actionData?: { error?: string; saved?: string } }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [read, setRead] = useState<Record<ChatSide, number>>({ a: 0, b: 0 });
  const [names, setNames] = useState<Partial<Record<ChatSide, string>>>({});
  const [online, setOnline] = useState(false);
  const [typingUntil, setTypingUntil] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(Boolean(side === "a" && !recipient));
  const [canAskPush, setCanAskPush] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setTick] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Pending[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const lastTyping = useRef(0);
  const height = useViewportHeight();
  const other = otherSide(side);

  useEffect(() => { pendingRef.current = pending; }, [pending]);

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(event)); return true; }
    return false;
  }, []);

  // Կապը՝ ավտոմատ վերականգնումով (1, 2, 4… մինչև 15 վայրկյան)։
  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry = 0;
    let ping = 0;
    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${CHAT_SOCKET_PATH}`);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
        socket.send(JSON.stringify({ type: "visible", visible: document.visibilityState === "visible" } satisfies ClientEvent));
        // Չհաստատված նամակները նորից (սերվերը նույն clientId-ով կրկին չի պահում)։
        for (const item of pendingRef.current) socket.send(JSON.stringify({ type: "send", text: item.body, clientId: item.clientId } satisfies ClientEvent));
        window.clearInterval(ping);
        ping = window.setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send("ping"); }, 25_000);
      };
      socket.onmessage = (raw) => {
        if (raw.data === "pong") return;
        let event: ServerEvent;
        try { event = JSON.parse(String(raw.data)) as ServerEvent; } catch { return; }
        switch (event.type) {
          case "init":
            stickToBottom.current = true;
            setMessages(event.messages);
            setHasMore(event.hasMore);
            setRead(event.read);
            setOnline(event.online);
            setNames(event.names);
            setReady(true);
            break;
          case "message":
            if (event.clientId) setPending((list) => list.filter((item) => item.clientId !== event.clientId));
            if (event.message.side === side) stickToBottom.current = true;
            else setTypingUntil(0);
            setMessages((list) => merge(list, [event.message]));
            break;
          case "history":
            loadingOlder.current = false;
            restoreFrom.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
            setMessages((list) => merge(list, event.messages));
            setHasMore(event.hasMore);
            break;
          case "read": setRead((value) => ({ ...value, [event.side]: Math.max(value[event.side], event.upTo) })); break;
          case "typing": setTypingUntil(Date.now() + 4000); break;
          case "presence": setOnline(event.online); if (!event.online) setTypingUntil(0); break;
          case "deleted": setMessages((list) => list.map((message) => (message.id === event.id ? { ...message, body: "", deleted: true } : message))); break;
          case "error": setNotice(event.message); break;
        }
      };
      socket.onclose = () => {
        window.clearInterval(ping);
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus("offline");
        setOnline(false);
        retry = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
      };
    };
    connect();
    const onVisible = () => {
      const visible = document.visibilityState === "visible";
      send({ type: "visible", visible });
      // Հեռախոսը քնից արթնանալիս կապը հաճախ արդեն կտրված է. միանգամից նորից։
      if (visible && !socketRef.current) { window.clearTimeout(retry); attempt = 0; connect(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(retry);
      window.clearInterval(ping);
      socketRef.current?.close(1000);
      socketRef.current = null;
    };
  }, [side, send]);

  // Կարդացի. երբ էջը էկրանին է և մյուսից նոր նամակ կա։
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible" || status !== "open") return;
      const last = messages.at(-1)?.id ?? 0;
      if (messages.some((message) => message.side === other && message.id > read[side]) && send({ type: "read", upTo: last })) {
        setRead((value) => ({ ...value, [side]: last }));
      }
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [messages, read, side, other, status, send]);

  // «գրում է…»-ն ինքն իրեն անհետանում է։
  useEffect(() => {
    if (!typingUntil) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), Math.max(0, typingUntil - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [typingUntil]);

  // Ներքև իջնել նոր նամակի դեպքում, իսկ հին նամակներ բեռնելիս՝ մնալ նույն տեղում։
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (restoreFrom.current !== null) { list.scrollTop = list.scrollHeight - restoreFrom.current; restoreFrom.current = null; return; }
    if (stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, pending, typingUntil, height]);

  // Դաշտը մեծանում է տեքստի հետ և ուղարկելուց հետո նորից փոքրանում։
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(140, input.scrollHeight + 2)}px`;
  }, [text]);

  // Ծանուցումներ բրաուզերում. եթե արդեն թույլատրված է, բաժանորդագրությունը թարմացնում ենք լուռ։
  useEffect(() => {
    if (pushSupport() !== "ready") return;
    if (Notification.permission === "granted") void enablePushNotifications();
    else setCanAskPush(true);
  }, []);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (list.scrollTop < 120 && hasMore && !loadingOlder.current && messages[0]) {
      loadingOlder.current = send({ type: "history", before: messages[0].id });
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim().slice(0, MESSAGE_MAX);
    if (!body) return;
    const item = { clientId: crypto.randomUUID(), body, at: Date.now() };
    setPending((list) => [...list, item]);
    stickToBottom.current = true;
    setText("");
    send({ type: "send", text: body, clientId: item.clientId });
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Համակարգչում Enter-ը ուղարկում է (Shift+Enter՝ նոր տող), հեռախոսում՝ նոր տող։
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) submit();
  };

  const onType = (value: string) => {
    setText(value);
    if (value && Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); send({ type: "typing" }); }
  };

  const remove = (id: number) => {
    if (window.confirm("Ջնջե՞լ այս նամակը երկուսի մոտ էլ։")) send({ type: "delete", id });
    setSelected(null);
  };

  const typing = typingUntil > Date.now();
  const otherName = names[other] ?? (side === "a" ? (recipient || "…") : "…");
  const subtitle = status !== "open" ? "Միանում է…" : typing ? "գրում է…" : online ? "առցանց" : "";

  type Row = { kind: "day"; key: string; label: string } | { kind: "message"; message: ChatMessage } | { kind: "pending"; item: Pending };
  const rows: Row[] = [];
  let lastDay = "";
  for (const entry of [...messages.map((message) => ({ at: message.at, row: { kind: "message", message } as Row })), ...pending.map((item) => ({ at: item.at, row: { kind: "pending", item } as Row }))]) {
    const key = dayKey(entry.at);
    if (key !== lastDay) { rows.push({ kind: "day", key, label: dayLabel(entry.at) }); lastDay = key; }
    rows.push(entry.row);
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[40] flex flex-col bg-[var(--page-bg)] text-ink" style={{ height: height ? `${height}px` : "100dvh" }}>
      <header className="flex shrink-0 items-center gap-2 border-b border-glass-border px-2 pb-2 pt-[calc(var(--tg-inset-top,0px)+8px)]">
        <Link to="/" className="grid size-10 place-items-center rounded-full text-gold-bright" aria-label="Գրադարան"><ArrowLeft aria-hidden="true" size={21} /></Link>
        <div className="grid min-w-0 flex-1">
          <strong className="truncate text-[16px]">{otherName}</strong>
          <span className={`h-[17px] text-[12.5px] ${typing || online ? "text-gold-bright" : "text-muted"}`}>{subtitle}</span>
        </div>
        {canAskPush && (
          <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" aria-label="Միացնել ծանուցումները (առանց ձայնի)"
            onClick={() => void enablePushNotifications().then((on) => { setCanAskPush(!on); setNotice(on ? "Ծանուցումները միացված են՝ առանց ձայնի և առանց տեքստի։" : Notification.permission === "denied" ? "Այս բրաուզերում ծանուցումներն արգելված են. թույլատրեք կայքի կարգավորումներում (հասցեի տողի կողքի նշանը)։" : "Այս բրաուզերը ծանուցումներ չի ընդունում. փորձեք Chrome-ում կամ Safari-ում, կամ բացեք Telegram-ով։"); })}>
            <Bell aria-hidden="true" size={19} />
          </button>
        )}
        {side === "a" && (
          <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" aria-label="Կարգավորում" onClick={() => setSettingsOpen(!settingsOpen)}>
            <Settings2 aria-hidden="true" size={19} />
          </button>
        )}
      </header>

      {side === "a" && settingsOpen && <ChatSettings recipient={recipient} actionData={actionData} onClose={() => setSettingsOpen(false)} />}
      {notice && (
        <button type="button" className="mx-3 mt-2 cursor-pointer rounded-[12px] border border-glass-border bg-subtle px-3 py-2 text-left text-[13px] text-muted" onClick={() => setNotice("")}>{notice}</button>
      )}

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" onClick={() => setSelected(null)}>
        {ready && !messages.length && !pending.length && (
          <p className="m-auto mt-10 grid max-w-[300px] justify-items-center gap-2 text-center text-[13px] text-muted">
            <Lock aria-hidden="true" size={22} className="text-gold" />
            Այս զրույցը տեսնում եք միայն դուք երկուսով։
          </p>
        )}
        {hasMore && <p className="m-0 py-2 text-center text-[12px] text-faint">…</p>}
        <div className="grid gap-1">
          {rows.map((row) => {
            if (row.kind === "day") {
              return <div key={`d-${row.key}`} className="my-2 justify-self-center rounded-full bg-subtle px-3 py-1 text-[12px] text-muted">{row.label}</div>;
            }
            const mine = row.kind === "pending" || row.message.side === side;
            const body = row.kind === "pending" ? row.item.body : row.message.body;
            const at = row.kind === "pending" ? row.item.at : row.message.at;
            const deleted = row.kind === "message" && row.message.deleted;
            const id = row.kind === "message" ? row.message.id : null;
            return (
              <div key={row.kind === "pending" ? `p-${row.item.clientId}` : `m-${row.message.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[82%] rounded-[18px] px-3 pb-1.5 pt-2 text-[15.5px] leading-[1.45] shadow-[0_1px_2px_rgb(0_0_0/10%)] ${mine ? "rounded-br-[6px] border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/20%)]" : "rounded-bl-[6px] border border-glass-border bg-subtle"}`}
                  onClick={(event) => { if (mine && id !== null && !deleted) { event.stopPropagation(); setSelected(selected === id ? null : id); } }}
                >
                  {deleted
                    ? <span className="italic text-faint">Նամակը ջնջված է</span>
                    : <span className="whitespace-pre-wrap break-words">{body}</span>}
                  <span className="float-right ml-2 mt-1.5 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] text-faint">
                    {timeOf(at)}
                    {mine && !deleted && (row.kind === "pending"
                      ? <Clock3 aria-label="Ուղարկվում է" size={13} />
                      : messageTicks(row.message, read[other]) === "read"
                        ? <CheckCheck aria-label="Կարդացել է" size={15} className="text-gold-bright" />
                        : <Check aria-label="Ուղարկված է" size={15} />)}
                  </span>
                  {id !== null && selected === id && (
                    <button type="button" className="absolute -top-9 right-0 inline-flex cursor-pointer items-center gap-1 rounded-full border border-[rgb(205_70_55/45%)] bg-[var(--page-bg)] px-3 py-1.5 text-[12.5px] font-bold text-[rgb(190_60_45)] shadow-md" onClick={(event) => { event.stopPropagation(); remove(id); }}>
                      <Trash2 aria-hidden="true" size={14} /> Ջնջել
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {typing && (
            <div className="flex justify-start"><div className="rounded-[18px] rounded-bl-[6px] border border-glass-border bg-subtle px-3 py-2 text-[13px] text-muted">գրում է…</div></div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-end gap-2 border-t border-glass-border px-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2">
        <textarea
          ref={inputRef}
          className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-[22px] border border-glass-border bg-control px-4 py-[10px] text-[16px] leading-[1.4] text-ink outline-none focus:border-[rgb(217_181_111/48%)]"
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          placeholder="Նամակ…"
          aria-label="Նամակ"
          autoComplete="off"
          onChange={(event) => onType(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" disabled={!text.trim()} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(217_181_111/85%)] text-[#2a1d10] disabled:opacity-40" aria-label="Ուղարկել">
          <SendHorizontal aria-hidden="true" size={20} />
        </button>
      </form>
    </div>
  );
}

/** Տիրոջ կարգավորումը. ով է երկրորդ կողմը։ */
function ChatSettings({ recipient, actionData, onClose }: { recipient: string | null; actionData?: { error?: string; saved?: string }; onClose: () => void }) {
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="mx-3 mt-2 grid gap-3 rounded-[16px] border border-glass-border bg-subtle p-3">
      <div className="flex items-center justify-between">
        <strong className="text-[14px]">Ով է զրույցի երկրորդ կողմը</strong>
        <button type="button" className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" aria-label="Փակել" onClick={onClose}><X aria-hidden="true" size={17} /></button>
      </div>
      <label className={fieldLabel}>Gmail հասցեն կամ @Telegram username (ստորակետով՝ մի քանիսը)
        <input className={fieldControl} name="recipient" defaultValue={recipient ?? ""} required maxLength={300} placeholder="anun@gmail.com" autoComplete="off" />
      </label>
      <p className={fieldHint}>Զրույցը տեսնում եք միայն դուք (Ձեր գլխավոր հաշիվներով) և այս մարդը։ Մյուս ադմինները՝ ոչ։ Նամակներ ունենալուց հետո ուրիշի փոխել չի կարելի։</p>
      {actionData?.error && <p className="m-0 text-[13px] font-semibold text-danger" role="alert">{actionData.error}</p>}
      {actionData?.saved && <p className="m-0 text-[13px] font-semibold text-gold-bright" role="status">{actionData.saved}</p>}
      <button type="submit" disabled={busy} className="min-h-11 cursor-pointer rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/18%)] px-5 text-[14px] font-bold text-gold-bright disabled:opacity-60">
        {busy ? "Պահվում է…" : "Պահել"}
      </button>
    </Form>
  );
}
