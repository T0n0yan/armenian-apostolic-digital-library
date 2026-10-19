import { env } from "cloudflare:workers";

import type { Route } from "./+types/psalm-timings";
import { getOptionalTelegramAdmin } from "../auth/admin.server";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

/** Saves ({ materialId, starts }) or clears ({ materialId, starts: null }) a psalm's verse timings. Editors only. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const admin = await getOptionalTelegramAdmin(request, env.DB);
  if (!admin) return Response.json({ ok: false }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; starts?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  if (!reference) return Response.json({ ok: false }, { status: 400 });
  if (body?.starts === null) {
    await env.DB.prepare("DELETE FROM psalm_timings WHERE chat_id = ? AND message_id = ?").bind(reference.chatId, reference.messageId).run();
    return Response.json({ ok: true });
  }
  const starts = Array.isArray(body?.starts) ? body.starts : null;
  // Seconds per verse, in order; a verse may be left unmarked (null).
  const valid = starts && starts.length > 0 && starts.length <= 200
    && starts.every((value) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 7_200));
  if (!valid) return Response.json({ ok: false }, { status: 400 });
  await env.DB.prepare(
    `INSERT INTO psalm_timings (chat_id, message_id, starts_json, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, message_id) DO UPDATE SET starts_json = excluded.starts_json, updated_by = excluded.updated_by,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(reference.chatId, reference.messageId, JSON.stringify(starts.map((value) => value === null ? null : Math.round((value as number) * 100) / 100)), user.id).run();
  return Response.json({ ok: true });
}
