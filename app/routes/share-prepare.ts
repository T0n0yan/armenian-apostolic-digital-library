import { env } from "cloudflare:workers";

import type { Route } from "./+types/share-prepare";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";

function shorten(value: string, length: number) {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length > length ? `${characters.slice(0, length - 1).join("")}…` : characters.join("");
}

/**
 * Prepares a material's link-preview card as a photo message the Mini App shares with
 * Telegram.WebApp.shareMessage (Bot API savePreparedInlineMessage): the card with the material's
 * name, text and site link as its caption, and a button to the page.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  const body = (await request.json().catch(() => null)) as { path?: unknown; caption?: unknown } | null;
  const path = typeof body?.path === "string" && /^\/[a-z-]+\/[a-z0-9-]{1,80}(?:\/\d{1,3})?$/u.test(body.path) ? body.path : null;
  if (!token || !path || user.source !== "telegram") return Response.json({ id: null }, { status: 400 });

  const origin = new URL(request.url).origin;
  const card = `${origin}/og/card${path}`;
  const caption = shorten(typeof body?.caption === "string" ? body.caption : `${origin}${path}`, 1000);
  const response = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: Number(user.telegramId),
      result: {
        type: "photo",
        id: crypto.randomUUID().replaceAll("-", ""),
        photo_url: card,
        thumbnail_url: card,
        caption,
        reply_markup: { inline_keyboard: [[{ text: "Կարդալ", url: `${origin}${path}` }]] },
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    }),
  }).catch(() => null);
  const result = (await response?.json().catch(() => null)) as { ok?: boolean; result?: { id?: string }; description?: string } | null;
  if (!result?.ok || !result.result?.id) {
    console.error("savePreparedInlineMessage failed", result?.description);
    return Response.json({ id: null }, { status: 502 });
  }
  return Response.json({ id: result.result.id });
}
