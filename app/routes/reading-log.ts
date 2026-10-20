import { env } from "cloudflare:workers";

import type { Route } from "./+types/reading-log";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { anyDay, logReading, readingEntries, removeReading, validDay } from "../data/reading-log.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

/** ?day=YYYY-MM-DD — what the reader read, listened to or watched that day. */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTelegramUser(request);
  const day = anyDay(new URL(request.url).searchParams.get("day"));
  if (!day) return Response.json({ entries: [] }, { status: 400 });
  const entries = await readingEntries(env.DB, user.id, day);
  return Response.json({ entries }, { headers: { "Cache-Control": "private, no-store" } });
}

/** { materialId, day, kind, remove? } — the reader marks (or unmarks) a material as read today. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; day?: unknown; kind?: unknown; remove?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  const day = validDay(body?.day);
  const kind = body?.kind === "listen" || body?.kind === "watch" ? body.kind : "read";
  if (!reference || !day) return Response.json({ ok: false }, { status: 400 });
  if (body?.remove === true) await removeReading(env.DB, { userId: user.id, day, chatId: reference.chatId, messageId: reference.messageId });
  else await logReading(env.DB, { userId: user.id, day, chatId: reference.chatId, messageId: reference.messageId, kind });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
