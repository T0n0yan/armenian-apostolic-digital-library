import { env } from "cloudflare:workers";

import type { Route } from "./+types/share-prepare";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { getCloudLibraryPost } from "../data/cloud-library.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

function shorten(value: string, length: number) {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length > length ? `${characters.slice(0, length - 1).join("")}…` : characters.join("");
}

/**
 * Prepares a material as a message the Mini App can share with Telegram.WebApp.shareMessage,
 * which opens Telegram's share sheet over the app (Bot API savePreparedInlineMessage).
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  const body = (await request.json().catch(() => null)) as { materialId?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  if (!token || !reference || user.source !== "telegram") return Response.json({ id: null }, { status: 400 });

  const post = await getCloudLibraryPost(env.DB, reference.chatId, reference.messageId);
  if (!post) return Response.json({ id: null }, { status: 404 });
  const title = shorten(post.title || "Հոգևոր ժառանգություն", 120);
  const description = shorten(post.contentText || post.captionText || post.categoryName || "", 200);
  const response = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: Number(user.telegramId),
      result: {
        type: "article",
        id: crypto.randomUUID().replaceAll("-", ""),
        title,
        description,
        input_message_content: { message_text: `${title}\n\n${post.telegramUrl}` },
        reply_markup: { inline_keyboard: [[{ text: "Բացել", url: post.telegramUrl }]] },
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
