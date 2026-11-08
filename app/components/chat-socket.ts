import { useCallback, useEffect, useRef, useState } from "react";

import { CHAT_SOCKET_PATH, type ChatStatus, type ClientEvent, type ServerEvent } from "../utils/private-chat";

type Status = "connecting" | "open" | "offline";

/** Լույսի գույները. 🟢 չատում է, 🟡 կայքում է (ոչ չատում), 🔴 փակել է։ */
export const STATUS_COLOR: Record<ChatStatus, string> = { chat: "#22c55e", app: "#eab308", away: "#ef4444" };

/**
 * Socket՝ ավտոմատ վերականգնումով (1, 2, 4… մինչև 15 վայրկյան), «ping»-ով և էկրանին վերադառնալիս՝ միանգամից։
 * where. «chat»՝ չատի էջը, «app»՝ կայքի մյուս էջերը (միայն լույսի և չկարդացվածների համար)։
 */
export function useChatSocket(where: "chat" | "app", enabled: boolean, onEvent: (event: ServerEvent) => void, onOpen?: (socket: WebSocket) => void) {
  const [status, setStatus] = useState<Status>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const handlers = useRef({ onEvent, onOpen });
  handlers.current = { onEvent, onOpen };

  const send = useCallback((event: ClientEvent) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(event)); return true; }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let retry = 0;
    let ping = 0;
    const reportWhere = () => send({ type: "where", where, visible: document.visibilityState === "visible" });
    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${CHAT_SOCKET_PATH}${where === "app" ? "?where=app" : ""}`);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
        reportWhere();
        handlers.current.onOpen?.(socket);
        window.clearInterval(ping);
        ping = window.setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send("ping"); }, 25_000);
      };
      socket.onmessage = (raw) => {
        if (raw.data === "pong") return;
        try { handlers.current.onEvent(JSON.parse(String(raw.data)) as ServerEvent); } catch { /* վնասված */ }
      };
      socket.onclose = () => {
        window.clearInterval(ping);
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus("offline");
        retry = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
      };
    };
    connect();
    const onVisible = () => {
      reportWhere();
      // Հեռախոսը քնից արթնանալիս կապը հաճախ արդեն կտրված է. միանգամից նորից։
      if (document.visibilityState === "visible" && !socketRef.current) { window.clearTimeout(retry); attempt = 0; connect(); }
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
  }, [where, enabled, send]);

  return { status, send };
}
