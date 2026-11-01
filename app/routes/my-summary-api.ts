import { env } from "cloudflare:workers";

import type { Route } from "./+types/my-summary-api";
import { requireTelegramUser } from "../auth/telegram-user.server";
import { personalSummary, personalYearData } from "../data/liturgy.server";

/**
 * ?period=2026 կամ ?period=2026-11 — մարդու տարվա կամ ամսվա ամփոփումը (միայն իր տվյալները)։
 * ?download=2026 — տարվա բոլոր գրառումները ֆայլով (JSON)։
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTelegramUser(request);
  const url = new URL(request.url);
  const download = url.searchParams.get("download");
  if (download && /^\d{4}$/u.test(download)) {
    const data = await personalYearData(env.DB, user.id, Number(download));
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="im-tarin-${download}.json"`, "Cache-Control": "private, no-store" },
    });
  }
  const summary = await personalSummary(env.DB, user.id, url.searchParams.get("period") ?? "");
  if (!summary) return Response.json({ error: "period" }, { status: 400 });
  return Response.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
}
