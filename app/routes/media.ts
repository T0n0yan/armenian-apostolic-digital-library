import { env } from "cloudflare:workers";

import type { Route } from "./+types/media";
import { proxyBridgeMedia } from "../data/telegram-bridge.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!/^-?\d{1,20}$/u.test(params.chatId) || !/^\d{1,20}$/u.test(params.messageId) || !/^\d{1,3}$/u.test(params.mediaIndex)) {
    return new Response("Media not found", { status: 404 });
  }
  const messageId = Number(params.messageId);
  const mediaIndex = Number(params.mediaIndex);
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !Number.isSafeInteger(mediaIndex)) {
    return new Response("Media not found", { status: 404 });
  }
  const upstream = await proxyBridgeMedia(env.DB, params.chatId, messageId, mediaIndex, request);
  const headers = new Headers();
  for (const name of ["accept-ranges", "cache-control", "content-length", "content-range", "content-type", "server-timing", "x-content-type-options"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", new URL(request.url).searchParams.get("thumbnail") === "1"
    ? "private, max-age=300"
    : "private, no-store");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
