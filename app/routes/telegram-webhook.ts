import { env } from "cloudflare:workers";

import type { Route } from "./+types/telegram-webhook";
import { answerUpdate, webhookSecret } from "../data/telegram-bot-replies.server";

/** Telegram calls this for messages to the bot; only Telegram knows the secret header. */
export async function action({ request, context }: Route.ActionArgs) {
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  if (!token || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await webhookSecret(token)) {
    return new Response(null, { status: 403 });
  }
  const update = await request.json().catch(() => null);
  // Answer Telegram at once; the reply is sent in the background.
  const work = answerUpdate(update ?? {}).catch(() => undefined);
  const ctx = (context as { cloudflare?: { ctx?: ExecutionContext } } | undefined)?.cloudflare?.ctx;
  if (ctx) ctx.waitUntil(work); else await work;
  return new Response(null, { status: 200 });
}
