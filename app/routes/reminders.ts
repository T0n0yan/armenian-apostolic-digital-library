import { env } from "cloudflare:workers";

import type { Route } from "./+types/reminders";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { deleteReminder, getReminder, isReminderRepeat, sendBellSoundOnce, setReminder, validReminderTime } from "../data/reminders.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

const noStore = { "Cache-Control": "private, no-store" };

/** The reader's reminder for one material (GET ?materialId=…). */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTelegramUser(request);
  const reference = parseMaterialId(new URL(request.url).searchParams.get("materialId") ?? "");
  if (!reference) return Response.json({ reminder: null }, { status: 400, headers: noStore });
  return Response.json({ reminder: await getReminder(env.DB, user.id, reference.chatId, reference.messageId) }, { headers: noStore });
}

/** Sets ({ materialId, remindAt, repeat }) or removes ({ materialId, remove: true }) a reminder. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; remindAt?: unknown; repeat?: unknown; remove?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  if (!reference) return Response.json({ ok: false }, { status: 400, headers: noStore });

  if (body?.remove === true) {
    await deleteReminder(env.DB, user.id, reference.chatId, reference.messageId);
    return Response.json({ ok: true, reminder: null }, { headers: noStore });
  }
  const remindAt = validReminderTime(body?.remindAt);
  const repeat = isReminderRepeat(body?.repeat) ? body.repeat : "none";
  if (!remindAt || user.source !== "telegram") return Response.json({ ok: false }, { status: 400, headers: noStore });

  await setReminder(env.DB, { userId: user.id, telegramId: user.telegramId, chatId: reference.chatId, messageId: reference.messageId, remindAt, repeat });
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  if (token) await sendBellSoundOnce(env.DB, token, user.telegramId, new URL(request.url).origin).catch(() => undefined);
  return Response.json({ ok: true, reminder: { materialId: body?.materialId, remindAt, repeat } }, { headers: noStore });
}
