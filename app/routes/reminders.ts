import { env } from "cloudflare:workers";

import type { Route } from "./+types/reminders";
import { getOptionalTelegramUser, requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import {
  completeReminder, deleteReminder, getReminder, isReminderRepeat, listUpcomingReminders,
  sendBellSoundOnce, setReminder, snoozeReminder, validReminderTime,
} from "../data/reminders.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

const noStore = { "Cache-Control": "private, no-store" };

/** GET ?materialId=… → that material's reminder; GET ?upcoming=1 → all the reader's reminders, soonest first. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("upcoming")) {
    // The in-app alarm asks on every page; guests simply have none.
    const user = await getOptionalTelegramUser(request);
    return Response.json({ reminders: user ? await listUpcomingReminders(env.DB, user.id, 366 * 24) : [] }, { headers: noStore });
  }
  const user = await requireTelegramUser(request);
  const reference = parseMaterialId(url.searchParams.get("materialId") ?? "");
  if (!reference) return Response.json({ reminder: null }, { status: 400, headers: noStore });
  return Response.json({ reminder: await getReminder(env.DB, user.id, reference.chatId, reference.messageId) }, { headers: noStore });
}

/**
 * { materialId, remindAt, repeat } sets a reminder; { materialId, remove: true } removes it;
 * { materialId, rang: true } marks it rung by the in-app alarm; { materialId, snooze: 1|5 } snoozes.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; remindAt?: unknown; repeat?: unknown; remove?: unknown; rang?: unknown; snooze?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  if (!reference || user.source === "local-development") return Response.json({ ok: false }, { status: 400, headers: noStore });
  const key = { userId: user.id, chatId: reference.chatId, messageId: reference.messageId };

  if (body?.remove === true) {
    await deleteReminder(env.DB, key.userId, key.chatId, key.messageId);
    return Response.json({ ok: true, reminder: null }, { headers: noStore });
  }
  if (body?.rang === true) {
    await completeReminder(env.DB, key);
    return Response.json({ ok: true }, { headers: noStore });
  }
  if (body?.snooze === 1 || body?.snooze === 5) {
    await snoozeReminder(env.DB, { ...key, telegramId: user.telegramId }, body.snooze);
    return Response.json({ ok: true }, { headers: noStore });
  }
  const remindAt = validReminderTime(body?.remindAt);
  const repeat = isReminderRepeat(body?.repeat) ? body.repeat : "none";
  if (!remindAt) return Response.json({ ok: false }, { status: 400, headers: noStore });

  await setReminder(env.DB, { ...key, telegramId: user.telegramId, remindAt, repeat });
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  if (token) await sendBellSoundOnce(env.DB, token, user.telegramId, new URL(request.url).origin).catch(() => undefined);
  return Response.json({ ok: true, reminder: { materialId: body?.materialId, remindAt, repeat } }, { headers: noStore });
}
