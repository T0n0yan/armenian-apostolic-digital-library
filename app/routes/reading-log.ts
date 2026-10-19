import { env } from "cloudflare:workers";

import type { Route } from "./+types/reading-log";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { logReading, validDay } from "../data/reading-log.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

/** { materialId, day, kind } — records that the reader read or listened to a material today. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; day?: unknown; kind?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  const day = validDay(body?.day);
  const kind = body?.kind === "listen" ? "listen" : "read";
  if (!reference || !day) return Response.json({ ok: false }, { status: 400 });
  await logReading(env.DB, { userId: user.id, day, chatId: reference.chatId, messageId: reference.messageId, kind });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
