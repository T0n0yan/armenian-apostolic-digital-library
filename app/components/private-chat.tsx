import { ArrowDown, ArrowLeft, Bell, CornerUpLeft, Check, CheckCheck, Clock3, ImagePlus, Lock, Mic, Pencil, SendHorizontal, Settings2, Square, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Form, Link, useNavigation } from "react-router";

import { STATUS_COLOR, useChatSocket } from "./chat-socket";
import { fieldControl, fieldHint, fieldLabel } from "./ui-styles";
import {
  BG_OPACITY_DEFAULT, CHAT_BACKGROUND_PATH, CHAT_UPLOAD_PATH, FILE_MAX, FONT_DEFAULT, FONT_MAX, FONT_MIN, MESSAGE_MAX, NICK_MAX, chatFileUrl, messageTicks, otherSide,
  type ChatMessage, type ChatPresence, type ChatReply, type ChatSettings, type ChatSide, type ChatStatus, type ClientEvent, type ServerEvent,
} from "../utils/private-chat";
import { enablePushNotifications, pushSupport } from "../utils/web-push";

type Pending = { clientId: string; kind: ChatMessage["kind"]; body: string; at: number; preview?: string; replyTo?: ChatReply | null };

const MONTHS = ["հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի", "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի"];
const pad = (value: number) => String(value).padStart(2, "0");
const timeOf = (at: number) => { const date = new Date(at); return `${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const dayKey = (at: number) => new Date(at).toDateString();
function dayLabel(at: number) {
  const date = new Date(at);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Այսօր";
  if (date.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return "Երեկ";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${date.getFullYear() === today.getFullYear() ? "" : ` ${date.getFullYear()}`}`;
}
function lastSeenLabel(at: number | null) {
  if (!at) return "";
  const day = dayLabel(at);
  return `վերջին անգամ՝ ${day === "Այսօր" ? "" : `${day.toLowerCase()}, `}${timeOf(at)}`;
}
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;

const STATUS_TEXT: Record<ChatStatus, string> = { chat: "չատում է", app: "կայքում է", away: "" };

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

/** Նկարը՝ փոքրացված (առավելագույնը 1600 px, JPEG), որ արագ գնա։ GIF-ը՝ ինչպես կա։ */
async function prepareImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  if (file.type !== "image/gif") {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob) return { blob, w: canvas.width, h: canvas.height };
    } catch { /* բրաուզերը չի կարողացել կարդալ. ուղարկում ենք ինչպես կա */ }
  }
  return { blob: file, w: 0, h: 0 };
}

function recorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/**
 * Անձնական չատը։ Socket-ով. նոր նամակը, «գրում է…», ✓✓, լույսը (🟢🟡🔴)՝ միանգամից։
 * Ոչինչ չի պահվում բրաուզերում (localStorage չկա). էջը փակելուց հետո հեռախոսում ոչինչ չի մնում։
 */
export function PrivateChat({ side, recipient, actionData }: { side: ChatSide; recipient: string | null; actionData?: { error?: string; saved?: string } }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [read, setRead] = useState<Record<ChatSide, number>>({ a: 0, b: 0 });
  const [names, setNames] = useState<Partial<Record<ChatSide, string>>>({});
  const [presence, setPresence] = useState<ChatPresence>({ status: "away", lastSeen: null });
  const [settings, setSettings] = useState<ChatSettings>({ nick: "", font: FONT_DEFAULT, bgOpacity: BG_OPACITY_DEFAULT, background: null, notifyPresence: true });
  const [opacityPreview, setOpacityPreview] = useState<number | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [typingUntil, setTypingUntil] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [replying, setReplying] = useState<ChatMessage | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(Boolean(side === "a" && !recipient));
  const [canAskPush, setCanAskPush] = useState(false);
  const [notice, setNotice] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [recording, setRecording] = useState<{ started: number } | null>(null);
  const [, setTick] = useState(0);

  const pendingRef = useRef<Pending[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; chunks: Blob[]; cancelled: boolean; stream: MediaStream } | null>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const lastTyping = useRef(0);
  const height = useViewportHeight();
  const other = otherSide(side);

  useEffect(() => { pendingRef.current = pending; }, [pending]);

  const dropPending = (clientId: string) => setPending((list) => {
    const item = list.find((entry) => entry.clientId === clientId);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    return list.filter((entry) => entry.clientId !== clientId);
  });

  const onEvent = (event: ServerEvent) => {
    switch (event.type) {
      case "init":
        stickToBottom.current = true;
        setMessages(event.messages);
        setHasMore(event.hasMore);
        setRead(event.read);
        setPresence(event.presence);
        setNames(event.names);
        setSettings(event.settings);
        setReady(true);
        break;
      case "message":
        if (event.clientId) dropPending(event.clientId);
        if (event.message.side === side) stickToBottom.current = true;
        else setTypingUntil(0);
        setMessages((list) => merge(list, [event.message]));
        break;
      case "edited":
        // Մեջբերումներն էլ են թարմանում (ով պատասխանել է այս նամակին)։
        setMessages((list) => merge(list.map((message) => (message.replyTo?.id === event.message.id ? { ...message, replyTo: { ...message.replyTo, body: event.message.body.slice(0, 200) } } : message)), [event.message]));
        break;
      case "history":
        loadingOlder.current = false;
        restoreFrom.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
        setMessages((list) => merge(list, event.messages));
        setHasMore(event.hasMore);
        break;
      case "read": setRead((value) => ({ ...value, [event.side]: Math.max(value[event.side], event.upTo) })); break;
      case "typing": setTypingUntil(Date.now() + 4000); break;
      case "presence": setPresence(event.presence); if (event.presence.status === "away") setTypingUntil(0); break;
      case "deleted": setMessages((list) => list.map((message) => (message.id === event.id
        ? { ...message, body: "", deleted: true, fileId: null, replyTo: null }
        : message.replyTo?.id === event.id ? { ...message, replyTo: { ...message.replyTo, body: "", deleted: true } } : message))); break;
      case "settings": setSettings(event.settings); setOpacityPreview(null); break;
      case "cleared": setMessages([]); setRead({ a: 0, b: 0 }); setHasMore(false); setEditing(null); break;
      case "error": setNotice(event.message); break;
      case "lite": break;
    }
  };

  const { status, send } = useChatSocket("chat", true, onEvent, (socket) => {
    // Չհաստատված տեքստերը նորից (սերվերը նույն clientId-ով կրկին չի պահում)։
    for (const item of pendingRef.current) if (item.kind === "text") socket.send(JSON.stringify({ type: "send", text: item.body, clientId: item.clientId } satisfies ClientEvent));
  });

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

  // «գրում է…»-ն ինքն իրեն անհետանում է, ձայնագրման ժամացույցը թարմանում է։
  useEffect(() => {
    if (!typingUntil && !recording) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, [typingUntil, recording]);

  // Ներքև իջնել նոր նամակի դեպքում, իսկ հին նամակներ բեռնելիս՝ մնալ նույն տեղում։
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (restoreFrom.current !== null) { list.scrollTop = list.scrollHeight - restoreFrom.current; restoreFrom.current = null; return; }
    if (stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, pending, typingUntil, height]);

  // Դաշտը մեծանում է տեքստի հետ (մինչև էկրանի 35%-ը, հետո՝ ոլորվում) և ուղարկելուց հետո փոքրանում։
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(Math.round((window.visualViewport?.height ?? window.innerHeight) * 0.35), input.scrollHeight + 2)}px`;
  }, [text, height]);

  // Ծանուցումներ բրաուզերում. եթե արդեն թույլատրված է, բաժանորդագրությունը թարմացնում ենք լուռ։
  useEffect(() => {
    if (pushSupport() !== "ready") return;
    if (Notification.permission === "granted") void enablePushNotifications();
    else setCanAskPush(true);
  }, []);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottom.current = distance < 80;
    setAwayFromBottom(distance > 400);
    if (list.scrollTop < 120 && hasMore && !loadingOlder.current && messages[0]) {
      loadingOlder.current = send({ type: "history", before: messages[0].id });
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim().slice(0, MESSAGE_MAX);
    if (!body) return;
    if (editing) {
      if (body !== editing.body) send({ type: "edit", id: editing.id, text: body });
      setEditing(null);
      setText("");
      return;
    }
    const reply = replying ? toReply(replying) : null;
    const item: Pending = { clientId: crypto.randomUUID(), kind: "text", body, at: Date.now(), replyTo: reply };
    setPending((list) => [...list, item]);
    stickToBottom.current = true;
    setText("");
    setReplying(null);
    send(reply ? { type: "send", text: body, clientId: item.clientId, replyTo: reply.id } : { type: "send", text: body, clientId: item.clientId });
    inputRef.current?.focus();
  };

  const upload = async (kind: "image" | "audio", blob: Blob, meta: { w?: number; h?: number; duration?: number }, preview?: string) => {
    if (blob.size > FILE_MAX) { setNotice("Ֆայլը շատ մեծ է (առավելագույնը 10 ՄԲ)։"); return; }
    const clientId = crypto.randomUUID();
    const reply = replying ? toReply(replying) : null;
    setReplying(null);
    setPending((list) => [...list, { clientId, kind, body: "", at: Date.now(), preview, replyTo: reply }]);
    stickToBottom.current = true;
    const query = new URLSearchParams({ kind, clientId });
    if (reply) query.set("replyTo", String(reply.id));
    for (const [key, value] of Object.entries(meta)) if (value) query.set(key, String(value));
    const response = await fetch(`${CHAT_UPLOAD_PATH}?${query}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }).catch(() => null);
    const result = await response?.json().catch(() => null) as { message?: ChatMessage; error?: string } | null;
    dropPending(clientId);
    if (result?.message) setMessages((list) => merge(list, [result.message!]));
    else setNotice(result?.error ?? (response?.status === 415 ? "Այս ձևաչափը չի ընդունվում։" : "Չհաջողվեց ուղարկել, փորձեք նորից։"));
  };

  const uploadBackground = async (file: File | undefined) => {
    if (!file) return;
    setNotice("Ֆոնը բեռնվում է…");
    const { blob } = await prepareImage(file);
    const response = await fetch(`${CHAT_UPLOAD_PATH}?kind=background`, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob }).catch(() => null);
    setNotice(response?.ok ? "Ֆոնը փոխված է։ Այն տեսնում եք միայն դուք։" : "Ֆոնը չհաջողվեց բեռնել։");
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const { blob, w, h } = await prepareImage(file);
    await upload("image", blob, { w, h }, URL.createObjectURL(blob));
  };

  const startRecording = async () => {
    const type = recorderType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) { setNotice("Այս բրաուզերը ձայնագրել չի կարող։"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const state = { recorder, chunks: [] as Blob[], cancelled: false, stream };
      recorderRef.current = state;
      const started = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(null);
        if (state.cancelled || !state.chunks.length) return;
        const blob = new Blob(state.chunks, { type: (recorder.mimeType || type || "audio/webm").split(";")[0] });
        void upload("audio", blob, { duration: (Date.now() - started) / 1000 });
      };
      recorder.start(1000);
      setRecording({ started });
      // 10 րոպեից ավտոմատ կանգ։
      window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 10 * 60_000);
    } catch {
      setNotice("Խոսափողը թույլատրված չէ։ Թույլատրեք բրաուզերի կարգավորումներում։");
    }
  };
  const stopRecording = (cancel: boolean) => {
    const state = recorderRef.current;
    if (!state) return;
    state.cancelled = cancel;
    if (state.recorder.state !== "inactive") state.recorder.stop();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Համակարգչում Enter-ը ուղարկում է (Shift+Enter՝ նոր տող), հեռախոսում՝ նոր տող։
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) submit();
    if (event.key === "Escape" && editing) { setEditing(null); setText(""); }
    if (event.key === "Escape" && replying) setReplying(null);
  };

  const onType = (value: string) => {
    setText(value);
    if (value && !editing && Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); send({ type: "typing" }); }
  };

  const remove = (id: number) => {
    if (window.confirm("Ջնջե՞լ այս նամակը երկուսի մոտ էլ։")) send({ type: "delete", id });
    setSelected(null);
  };
  const reply = (message: ChatMessage) => {
    setReplying(message);
    setEditing(null);
    setSelected(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  /** Մեջբերման վրա սեղմելիս՝ գնալ բուն նամակին և մի պահ ընդգծել այն։ */
  const jumpTo = (id: number) => {
    const target = document.getElementById(`msg-${id}`);
    if (!target) { setNotice("Այդ նամակը ավելի վերևում է. ոլորեք վերև։"); return; }
    stickToBottom.current = false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash((value) => (value === id ? null : value)), 1600);
  };
  const edit = (message: ChatMessage) => {
    setReplying(null);
    setEditing(message);
    setText(message.body);
    setSelected(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const typing = typingUntil > Date.now();
  const otherName = settings.nick || names[other] || (side === "a" ? (recipient || "…") : "…");
  const subtitle = status !== "open" ? "Միանում է…" : typing ? "գրում է…" : STATUS_TEXT[presence.status] || lastSeenLabel(presence.lastSeen);

  type Row = { kind: "day"; key: string; label: string } | { kind: "message"; message: ChatMessage } | { kind: "pending"; item: Pending };
  const rows: Row[] = [];
  let lastDay = "";
  for (const entry of [...messages.map((message) => ({ at: message.at, row: { kind: "message", message } as Row })), ...pending.map((item) => ({ at: item.at, row: { kind: "pending", item } as Row }))]) {
    const key = dayKey(entry.at);
    if (key !== lastDay) { rows.push({ kind: "day", key, label: dayLabel(entry.at) }); lastDay = key; }
    rows.push(entry.row);
  }
  const iconButton = "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted";

  return (
    <div className="fixed inset-x-0 top-0 z-[40] flex flex-col overflow-hidden bg-[var(--page-bg)] text-ink" style={{ height: height ? `${height}px` : "100dvh" }}>
      {/* Ֆոնը՝ թույլ երևացող. նկարը տրվում է միայն երկու կողմին (/namak/background)։ */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center transition-opacity duration-300"
        style={{ backgroundImage: `url(${CHAT_BACKGROUND_PATH}?v=${settings.background ?? 0})`, opacity: ready ? opacityPreview ?? settings.bgOpacity : 0 }} />
      <header className="relative flex shrink-0 bg-[color-mix(in_srgb,var(--page-bg)_80%,transparent)] backdrop-blur-md items-center gap-2 border-b border-glass-border px-2 pb-2 pt-[calc(var(--tg-inset-top,0px)+8px)]">
        <Link to="/" className="grid size-10 place-items-center rounded-full text-gold-bright" aria-label="Գրադարան"><ArrowLeft aria-hidden="true" size={21} /></Link>
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/14%)] text-[16px] font-bold text-gold-bright">
          {otherName.trim().charAt(0).toUpperCase() || "…"}
          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-[var(--page-bg)]" style={{ background: STATUS_COLOR[presence.status] }}
            title={presence.status === "chat" ? "Չատում է" : presence.status === "app" ? "Կայքում է, բայց ոչ չատում" : "Փակել է"} />
        </span>
        <div className="grid min-w-0 flex-1">
          <strong className="truncate text-[16px]">{otherName}</strong>
          <span className={`h-[17px] truncate text-[12.5px] ${typing || presence.status === "chat" ? "text-gold-bright" : "text-muted"}`}>{subtitle}</span>
        </div>
        {canAskPush && (
          <button type="button" className={iconButton} aria-label="Միացնել ծանուցումները (առանց ձայնի)"
            onClick={() => void enablePushNotifications().then((on) => { setCanAskPush(!on); setNotice(on ? "Ծանուցումները միացված են՝ առանց ձայնի և առանց տեքստի։" : Notification.permission === "denied" ? "Այս բրաուզերում ծանուցումներն արգելված են. թույլատրեք կայքի կարգավորումներում (հասցեի տողի կողքի նշանը)։" : "Այս բրաուզերը ծանուցումներ չի ընդունում. փորձեք Chrome-ում կամ Safari-ում, կամ բացեք Telegram-ով։"); })}>
            <Bell aria-hidden="true" size={19} />
          </button>
        )}
        <button type="button" className={iconButton} aria-label="Կարգավորում" onClick={() => setSettingsOpen(!settingsOpen)}>
          <Settings2 aria-hidden="true" size={19} />
        </button>
      </header>

      {settingsOpen && (
        <div className="relative max-h-[42%] min-h-0 shrink overflow-y-auto">
          <ChatPreferences settings={settings} owner={side === "a"} placeholder={names[other] ?? ""} onPreview={setOpacityPreview}
            onSave={(next) => { send({ type: "settings", ...next }); setNotice("Պահված է։"); }}
            onBackground={(file) => void uploadBackground(file)} onReset={() => { send({ type: "background-reset" }); setNotice("Վերադարձված է ընդհանուր ֆոնը։"); }} />
          {side === "a" && <OwnerSettings recipient={recipient} actionData={actionData} onClear={() => send({ type: "clear" })} />}
        </div>
      )}
      {notice && (
        <button type="button" className="relative mx-3 mt-2 cursor-pointer rounded-[12px] border border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_88%,transparent)] px-3 py-2 text-left text-[13px] text-muted" onClick={() => setNotice("")}>{notice}</button>
      )}

      <div ref={listRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3" onClick={() => setSelected(null)}>
        {ready && !messages.length && !pending.length && (
          <p className="m-auto mt-10 grid max-w-[300px] justify-items-center gap-2 text-center text-[13px] text-muted">
            <Lock aria-hidden="true" size={22} className="text-gold" />
            Այս զրույցը տեսնում եք միայն դուք երկուսով։
          </p>
        )}
        {hasMore && <p className="m-0 py-2 text-center text-[12px] text-faint">…</p>}
        <div className="grid gap-1" style={{ fontSize: `${settings.font}px` }}>
          {rows.map((row) => {
            if (row.kind === "day") {
              return <div key={`d-${row.key}`} className="my-2 justify-self-center rounded-full bg-[color-mix(in_srgb,var(--page-bg)_82%,transparent)] px-3 py-1 text-[12px] text-muted backdrop-blur-sm">{row.label}</div>;
            }
            const message = row.kind === "message" ? row.message : null;
            const mine = row.kind === "pending" || message?.side === side;
            const kind = row.kind === "pending" ? row.item.kind : message!.kind;
            const at = row.kind === "pending" ? row.item.at : message!.at;
            const deleted = Boolean(message?.deleted);
            const id = message?.id ?? null;
            const media = kind !== "text" && !deleted;
            return (
              <div key={row.kind === "pending" ? `p-${row.item.clientId}` : `m-${message!.id}`} id={id !== null ? `msg-${id}` : undefined}
                className={`flex rounded-[20px] transition-colors duration-500 ${mine ? "justify-end" : "justify-start"} ${id !== null && flash === id ? "bg-[rgb(217_181_111/22%)]" : ""}`}>
                <div
                  className={`relative max-w-[82%] rounded-[18px] ${media ? "p-1.5" : "px-3 pb-1.5 pt-2"} leading-[1.45] shadow-[0_1px_2px_rgb(0_0_0/10%)] ${mine ? "rounded-br-[6px] border border-[rgb(217_181_111/45%)] bg-[color-mix(in_srgb,rgb(217_181_111)_24%,var(--page-bg))]" : "rounded-bl-[6px] border border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_92%,transparent)] backdrop-blur-sm"}`}
                  onClick={(event) => { if (id !== null && !deleted) { event.stopPropagation(); setSelected(selected === id ? null : id); } }}
                >
                  {!deleted && (row.kind === "pending" ? row.item.replyTo : message!.replyTo) ? (
                    <ReplyQuote reply={(row.kind === "pending" ? row.item.replyTo : message!.replyTo)!} mine={(row.kind === "pending" ? row.item.replyTo : message!.replyTo)!.side === side}
                      otherName={otherName} onJump={jumpTo} />
                  ) : null}
                  {deleted ? <span className="italic text-faint">Նամակը ջնջված է</span>
                    : kind === "image" ? (
                      row.kind === "pending"
                        ? <img className="block max-h-[320px] max-w-[260px] rounded-[13px] opacity-60" src={row.item.preview} alt="" />
                        : <button type="button" className="block cursor-zoom-in border-0 bg-transparent p-0" onClick={(event) => { event.stopPropagation(); setViewer(message!.fileId); }}>
                          <img className="block max-h-[320px] max-w-[260px] rounded-[13px] bg-subtle object-cover" src={chatFileUrl(message!.fileId!)} alt="Նկար" loading="lazy"
                            style={message!.meta?.w && message!.meta.h ? { aspectRatio: `${message!.meta.w} / ${message!.meta.h}`, width: Math.min(260, message!.meta.w) } : undefined} />
                        </button>
                    )
                    : kind === "audio" ? (
                      row.kind === "pending"
                        ? <span className="block px-2 py-2 text-[13px] text-muted">🎙 Ուղարկվում է…</span>
                        : <audio className="block h-10 w-[240px] max-w-full" controls preload="metadata" src={chatFileUrl(message!.fileId!)} onClick={(event) => event.stopPropagation()} />
                    )
                    : <span className="whitespace-pre-wrap break-words">{row.kind === "pending" ? row.item.body : message!.body}</span>}
                  <span className={`float-right ml-2 mt-1.5 inline-flex translate-y-0.5 items-center gap-0.5 text-[11px] text-faint ${media ? "px-1.5" : ""}`}>
                    {message?.editedAt && !deleted ? <span className="mr-1 italic">փոփոխված</span> : null}
                    {kind === "audio" && message?.meta?.duration ? <span className="mr-1">{duration(message.meta.duration)}</span> : null}
                    {timeOf(at)}
                    {mine && !deleted && (row.kind === "pending"
                      ? <Clock3 aria-label="Ուղարկվում է" size={13} />
                      : messageTicks(message!, read[other]) === "read"
                        ? <CheckCheck aria-label="Կարդացել է" size={15} className="text-gold-bright" />
                        : <Check aria-label="Ուղարկված է" size={15} />)}
                  </span>
                  {id !== null && selected === id && (
                    <span className={`absolute -top-10 z-10 flex gap-1.5 ${mine ? "right-0" : "left-0"}`}>
                      <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-glass-border bg-[var(--page-bg)] px-3 py-1.5 text-[12.5px] font-bold text-gold-bright shadow-md" onClick={(event) => { event.stopPropagation(); reply(message!); }}>
                        <CornerUpLeft aria-hidden="true" size={14} /> Պատասխանել
                      </button>
                      {mine && kind === "text" && (
                        <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-glass-border bg-[var(--page-bg)] px-3 py-1.5 text-[12.5px] font-bold text-ink shadow-md" onClick={(event) => { event.stopPropagation(); edit(message!); }}>
                          <Pencil aria-hidden="true" size={14} /> Փոխել
                        </button>
                      )}
                      {mine && (
                        <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[rgb(205_70_55/45%)] bg-[var(--page-bg)] px-3 py-1.5 text-[12.5px] font-bold text-[rgb(190_60_45)] shadow-md" onClick={(event) => { event.stopPropagation(); remove(id); }}>
                          <Trash2 aria-hidden="true" size={14} /> Ջնջել
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {typing && (
            <div className="flex justify-start"><div className="rounded-[18px] rounded-bl-[6px] border border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_92%,transparent)] px-3 py-2 text-[13px] text-muted">գրում է…</div></div>
          )}
        </div>
      </div>

      {awayFromBottom && (
        <div className="relative h-0">
          <button type="button" className="absolute -top-14 right-3 grid size-10 cursor-pointer place-items-center rounded-full border border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_90%,transparent)] text-gold-bright shadow-md backdrop-blur-md" aria-label="Ներքև"
            onClick={() => { stickToBottom.current = true; listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }}>
            <ArrowDown aria-hidden="true" size={19} />
          </button>
        </div>
      )}

      {replying && !editing && (
        <div className="relative flex shrink-0 items-center gap-2 border-t border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_86%,transparent)] px-3 py-1.5 backdrop-blur-md">
          <CornerUpLeft aria-hidden="true" size={15} className="shrink-0 text-gold-bright" />
          <div className="min-w-0 flex-1 border-l-2 border-[rgb(217_181_111/70%)] pl-2">
            <strong className="block truncate text-[12.5px] text-gold-bright">{replying.side === side ? "Ձեզ" : otherName}</strong>
            <span className="block truncate text-[12.5px] text-muted">{replyText(toReply(replying))}</span>
          </div>
          <button type="button" className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" aria-label="Չեղարկել պատասխանը" onClick={() => setReplying(null)}><X aria-hidden="true" size={16} /></button>
        </div>
      )}

      {editing && (
        <div className="relative flex shrink-0 bg-[color-mix(in_srgb,var(--page-bg)_86%,transparent)] backdrop-blur-md items-center gap-2 border-t border-glass-border px-3 py-1.5 text-[12.5px] text-muted">
          <Pencil aria-hidden="true" size={14} className="text-gold-bright" />
          <span className="min-w-0 flex-1 truncate">Փոփոխում եք՝ {editing.body}</span>
          <button type="button" className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" aria-label="Չեղարկել" onClick={() => { setEditing(null); setText(""); }}><X aria-hidden="true" size={16} /></button>
        </div>
      )}

      {recording ? (
        <div className="relative flex shrink-0 items-center gap-3 border-t border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_86%,transparent)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 backdrop-blur-md">
          <button type="button" className={iconButton} aria-label="Չեղարկել" onClick={() => stopRecording(true)}><X aria-hidden="true" size={20} /></button>
          <span className="size-3 animate-pulse rounded-full bg-[#ef4444]" aria-hidden="true" />
          <span className="flex-1 text-[15px] tabular-nums">{duration((Date.now() - recording.started) / 1000)}</span>
          <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(217_181_111/85%)] text-[#2a1d10]" aria-label="Ուղարկել ձայնագրությունը" onClick={() => stopRecording(false)}>
            <Square aria-hidden="true" size={16} fill="currentColor" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="relative flex shrink-0 items-end gap-1.5 border-t border-glass-border bg-[color-mix(in_srgb,var(--page-bg)_86%,transparent)] backdrop-blur-md px-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2">
          {!editing && (
            <>
              <button type="button" className={`${iconButton} mb-0.5`} aria-label="Նկար ուղարկել" onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden="true" size={21} /></button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ""; }} />
            </>
          )}
          <textarea
            ref={inputRef}
            className="min-h-[44px] flex-1 resize-none overflow-y-auto rounded-[22px] border border-glass-border bg-control px-4 py-[10px] text-[16px] leading-[1.4] text-ink outline-none focus:border-[rgb(217_181_111/48%)]"
            rows={1}
            value={text}
            maxLength={MESSAGE_MAX}
            placeholder="Նամակ…"
            aria-label="Նամակ"
            autoComplete="off"
            onChange={(event) => onType(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {text.trim() || editing ? (
            <button type="submit" disabled={!text.trim()} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(217_181_111/85%)] text-[#2a1d10] disabled:opacity-40" aria-label={editing ? "Պահել փոփոխությունը" : "Ուղարկել"}>
              {editing ? <Check aria-hidden="true" size={20} /> : <SendHorizontal aria-hidden="true" size={20} />}
            </button>
          ) : (
            <button type="button" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(217_181_111/85%)] text-[#2a1d10]" aria-label="Ձայնագրել" onClick={() => void startRecording()}>
              <Mic aria-hidden="true" size={20} />
            </button>
          )}
        </form>
      )}

      {viewer !== null && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-3" role="dialog" aria-label="Նկար" onClick={() => setViewer(null)}>
          <img className="max-h-full max-w-full object-contain" src={chatFileUrl(viewer)} alt="Նկար" />
          <button type="button" className="absolute right-3 top-[calc(var(--tg-inset-top,0px)+12px)] grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white/15 text-white" aria-label="Փակել"><X aria-hidden="true" size={20} /></button>
        </div>
      )}
    </div>
  );
}

function toReply(message: ChatMessage): ChatReply {
  return { id: message.id, side: message.side, kind: message.kind, body: message.body.slice(0, 200), deleted: message.deleted };
}
function replyText(reply: ChatReply) {
  if (reply.deleted) return "Նամակը ջնջված է";
  if (reply.kind === "image") return "📷 Նկար";
  if (reply.kind === "audio") return "🎙 Ձայնային հաղորդագրություն";
  return reply.body.replace(/\s+/gu, " ");
}

/** Մեջբերումը նամակի վերևում. սեղմելիս՝ գնալ բուն նամակին։ */
function ReplyQuote({ reply, mine, otherName, onJump }: { reply: ChatReply; mine: boolean; otherName: string; onJump: (id: number) => void }) {
  return (
    <button type="button" className="mb-1.5 block w-full min-w-[120px] cursor-pointer rounded-[10px] border-0 border-l-[3px] border-solid border-[rgb(217_181_111/80%)] bg-[rgb(0_0_0/7%)] px-2 py-1 text-left"
      onClick={(event) => { event.stopPropagation(); onJump(reply.id); }}>
      <strong className="block truncate text-[12px] text-gold-bright">{mine ? "Դուք" : otherName}</strong>
      <span className="line-clamp-2 block text-[12.5px] leading-snug text-muted">{replyText(reply)}</span>
    </button>
  );
}

/** Երկուսի համար. ինչպես եմ տեսնում մյուսի անունը և տեքստի չափը։ */
function ChatPreferences({ settings, owner, placeholder, onSave, onPreview, onBackground, onReset }: {
  settings: ChatSettings; placeholder: string;
  owner: boolean;
  onSave: (next: { nick: string; font: number; bgOpacity: number; notifyPresence: boolean }) => void;
  onPreview: (opacity: number | null) => void; onBackground: (file: File | undefined) => void; onReset: () => void;
}) {
  const [nick, setNick] = useState(settings.nick);
  const [font, setFont] = useState(settings.font);
  const [opacity, setOpacity] = useState(settings.bgOpacity);
  const [notifyPresence, setNotifyPresence] = useState(settings.notifyPresence);
  const backgroundRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setNick(settings.nick); setFont(settings.font); setOpacity(settings.bgOpacity); setNotifyPresence(settings.notifyPresence); }, [settings]);
  const step = (delta: number) => setFont((value) => Math.min(FONT_MAX, Math.max(FONT_MIN, value + delta)));
  return (
    <form className="mx-3 mt-2 grid gap-3 rounded-[16px] border border-glass-border bg-subtle p-3" onSubmit={(event) => { event.preventDefault(); onSave({ nick: nick.trim(), font, bgOpacity: opacity, notifyPresence }); }}>
      <label className={fieldLabel}>Ինչ անունով տեսնեմ նրան
        <input className={fieldControl} value={nick} onChange={(event) => setNick(event.target.value)} maxLength={NICK_MAX} placeholder={placeholder || "Անուն"} autoComplete="off" />
      </label>
      <div className="grid gap-2">
        <span className="text-[13px] font-[720]">Տեքստի չափը</span>
        <div className="flex items-center gap-3">
          <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full border border-glass-border bg-[var(--page-bg)] text-[14px] font-bold text-ink" aria-label="Փոքրացնել" onClick={() => step(-1)}>A−</button>
          <span className="flex-1 rounded-[12px] border border-glass-border bg-[var(--page-bg)] px-3 py-2 text-center" style={{ fontSize: `${font}px` }}>Բարև 🙂</span>
          <button type="button" className="grid size-10 cursor-pointer place-items-center rounded-full border border-glass-border bg-[var(--page-bg)] text-[17px] font-bold text-ink" aria-label="Մեծացնել" onClick={() => step(1)}>A+</button>
        </div>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-[720]">Ֆոնը (տեսնում եք միայն դուք)</span>
        <div className="flex items-center gap-3">
          <span className="block h-16 w-11 shrink-0 rounded-[8px] border border-glass-border bg-cover bg-center" style={{ backgroundImage: `url(${CHAT_BACKGROUND_PATH}?v=${settings.background ?? 0})` }} aria-hidden="true" />
          <div className="grid flex-1 gap-1.5">
            <button type="button" className="min-h-10 cursor-pointer rounded-full border border-glass-border bg-[var(--page-bg)] px-3 text-[13px] font-bold text-ink" onClick={() => backgroundRef.current?.click()}>Ընտրել իմ նկարը</button>
            {settings.background !== null && (
              <button type="button" className="min-h-9 cursor-pointer rounded-full border-0 bg-transparent px-3 text-[12.5px] text-muted underline" onClick={onReset}>Վերադարձնել ընդհանուր ֆոնը</button>
            )}
          </div>
          <input ref={backgroundRef} type="file" accept="image/*" hidden onChange={(event) => { onBackground(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <label className="grid gap-1 text-[12.5px] text-muted">Որքան երևա՝ {Math.round(opacity * 100)}%
          <input type="range" min={5} max={80} step={1} value={Math.round(opacity * 100)} className="w-full accent-[rgb(217_181_111)]"
            onChange={(event) => { const value = Number(event.target.value) / 100; setOpacity(value); onPreview(value); }} />
        </label>
      </div>
      {owner && (
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug">
          <input type="checkbox" className="mt-0.5 size-4 accent-[rgb(217_181_111)]" checked={notifyPresence} onChange={(event) => setNotifyPresence(event.target.checked)} />
          <span>Ծանուցել ինձ, երբ նա բացում է կայքը <span className="block text-[12px] text-muted">Առանց ձայնի, ոչ ավելի հաճախ, քան 20 րոպեն մեկ</span></span>
        </label>
      )}
      <button type="submit" className="min-h-11 cursor-pointer rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/18%)] px-5 text-[14px] font-bold text-gold-bright">Պահել</button>
    </form>
  );
}

/** Միայն տիրոջ համար. ով է երկրորդ կողմը և ամբողջ զրույցի ջնջումը։ */
function OwnerSettings({ recipient, actionData, onClear }: { recipient: string | null; actionData?: { error?: string; saved?: string }; onClear: () => void }) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="mx-3 my-2 grid gap-3 rounded-[16px] border border-glass-border bg-subtle p-3">
      <Form method="post" className="grid gap-3">
        <label className={fieldLabel}>Զրույցի երկրորդ կողմը (Gmail կամ @Telegram username, ստորակետով՝ մի քանիսը)
          <input className={fieldControl} name="recipient" defaultValue={recipient ?? ""} required maxLength={300} placeholder="anun@gmail.com" autoComplete="off" />
        </label>
        <p className={fieldHint}>Զրույցը տեսնում եք միայն դուք (Ձեր գլխավոր հաշիվներով) և այս մարդը։ Մյուս ադմինները՝ ոչ։ Նամակներ ունենալուց հետո ուրիշի փոխել չի կարելի։</p>
        {actionData?.error && <p className="m-0 text-[13px] font-semibold text-danger" role="alert">{actionData.error}</p>}
        {actionData?.saved && <p className="m-0 text-[13px] font-semibold text-gold-bright" role="status">{actionData.saved}</p>}
        <button type="submit" disabled={busy} className="min-h-11 cursor-pointer rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/18%)] px-5 text-[14px] font-bold text-gold-bright disabled:opacity-60">
          {busy ? "Պահվում է…" : "Պահել ստացողին"}
        </button>
      </Form>
      <button type="button" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[rgb(205_70_55/45%)] bg-[rgb(205_70_55/10%)] px-5 text-[14px] font-bold text-[rgb(190_60_45)]"
        onClick={() => {
          const answer = window.prompt("Ամբողջ զրույցը (նամակներ, նկարներ, ձայնագրություններ) կջնջվի երկուսի մոտ էլ, վերադարձնել հնարավոր չի լինի։ Հաստատելու համար գրեք՝ ՋՆՋԵԼ");
          if (answer?.trim().toUpperCase() === "ՋՆՋԵԼ") onClear();
        }}>
        <Trash2 aria-hidden="true" size={16} /> Ջնջել ամբողջ զրույցը
      </button>
    </div>
  );
}
