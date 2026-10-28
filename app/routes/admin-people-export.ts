import { env } from "cloudflare:workers";

import type { Route } from "./+types/admin-people-export";
import { requirePermission } from "../auth/admin.server";
import { listDevices, listPeople } from "../data/people.server";
import { EXPORT_PAGE_SIZE } from "../data/people";
import { validPlatform } from "../data/presence.server";

/**
 * GET /admin/people/export?tab=people|devices&offset=… — one piece of the list as plain rows; the
 * admin's browser builds the Excel file from them (app/routes/admin-people.tsx).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "people");
  const url = new URL(request.url);
  const offset = Math.max(0, Math.min(500_000, Number(url.searchParams.get("offset")) || 0));
  const headers = { "Cache-Control": "private, no-store" };
  if (url.searchParams.get("tab") === "devices") {
    const platform = url.searchParams.get("platform");
    const { devices } = await listDevices(env.DB, { platform: platform ? validPlatform(platform) : null, offset, limit: EXPORT_PAGE_SIZE });
    return Response.json({ rows: devices.map((device) => [device.platform, device.inTelegram ? 1 : 0, device.firstSeen, device.lastSeen]) }, { headers });
  }
  const { people } = await listPeople(env.DB, { query: (url.searchParams.get("q") ?? "").slice(0, 80), offset, limit: EXPORT_PAGE_SIZE });
  return Response.json({ rows: people.map((person) => [person.displayName, person.username, person.telegramId, person.role, person.createdAt, person.lastSeenAt]) }, { headers });
}
