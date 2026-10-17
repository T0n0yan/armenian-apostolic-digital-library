import { env } from "cloudflare:workers";

import type { Route } from "./+types/media";
import { readCloudMedia } from "../data/cloud-media.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!/^-?\d{1,20}$/u.test(params.chatId) || !/^\d{1,20}$/u.test(params.messageId) || !/^\d{1,3}$/u.test(params.mediaIndex)) {
    return new Response("Media not found", { status: 404 });
  }
  const messageId = Number(params.messageId);
  const mediaIndex = Number(params.mediaIndex);
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !Number.isSafeInteger(mediaIndex)) {
    return new Response("Media not found", { status: 404 });
  }
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const range = request.headers.get("Range");
  const rangeKind = range === null ? "none"
    : /^bytes=\d+-\d+$/u.test(range) ? "closed"
      : /^bytes=\d+-$/u.test(range) ? "open"
        : /^bytes=-\d+$/u.test(range) ? "suffix" : "unsupported";
  try {
    const response = await readCloudMedia(env.DB, env.MEDIA, params.chatId, messageId, mediaIndex, request);
    response.headers.set("X-Media-Request-Id", requestId);
    console.info(JSON.stringify({
      event: "cloud-media-response",
      requestId,
      method: request.method,
      rangeKind,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "cloud-media-error",
      requestId,
      method: request.method,
      rangeKind,
      durationMs: Math.round(performance.now() - startedAt),
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return new Response("Media temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "2", "X-Media-Request-Id": requestId },
    });
  }
}
