import { env } from "cloudflare:workers";

import type { Route } from "./+types/telegram-webhook";
import { answerUpdate, webhookSecret } from "../data/telegram-bot-replies.server";
import { syncSoon } from "../data/clock.server";
import { LIBRARY_CHAT_ID } from "../utils/material-path";

type PostUpdate = { message?: { chat?: { id?: number } }; edited_message?: { chat?: { id?: number } } };

/** A post added or edited in the library's group (the bot is an admin there, so it sees them). */
function isLibraryPost(update: PostUpdate | null) {
  const chat = (update?.message ?? update?.edited_message)?.chat?.id;
  return chat !== undefined && String(chat) === LIBRARY_CHAT_ID;
}

/** Telegram calls this for messages to the bot; only Telegram knows the secret header. */
export async function action({ request, context }: Route.ActionArgs) {
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  if (!token || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await webhookSecret(token)) {
    return new Response(null, { status: 403 });
  }
  const update = await request.json().catch(() => null);
  // New posts start the sync 15 minutes after the last one (production's bot only: one sync
  // fills both sites).
  const sync = (env as { SYNC_ON_POSTS?: string }).SYNC_ON_POSTS === "1" && isLibraryPost(update as PostUpdate | null)
    ? syncSoon().catch((error: unknown) => console.error("sync clock", error))
    : Promise.resolve();
  // Answer Telegram at once; the reply is sent in the background.
  const work = Promise.all([answerUpdate(update ?? {}).catch(() => undefined), sync]);
  const ctx = (context as { cloudflare?: { ctx?: ExecutionContext } } | undefined)?.cloudflare?.ctx;
  if (ctx) ctx.waitUntil(work); else await work;
  return new Response(null, { status: 200 });
}
