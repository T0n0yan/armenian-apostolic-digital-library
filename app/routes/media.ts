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
  return readCloudMedia(env.DB, env.MEDIA, params.chatId, messageId, mediaIndex, request);
}
