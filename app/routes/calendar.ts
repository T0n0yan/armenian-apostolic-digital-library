import type { Route } from "./+types/calendar";
import { calendarFile, type CalendarRepeat } from "../utils/calendar";

const REPEATS = new Set<CalendarRepeat>(["none", "daily", "weekly", "monthly", "yearly"]);

/**
 * GET /api/calendar?title=…&path=/pray/71&start=20261025T070000&repeat=daily — the reminder as an
 * .ics event for the phone's own calendar. Nothing is stored; the phone rings it by itself.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "").replace(/\s+/gu, " ").trim().slice(0, 120) || "Հոգևոր ժառանգություն";
  const path = url.searchParams.get("path") ?? "/";
  const start = url.searchParams.get("start") ?? "";
  const repeat = url.searchParams.get("repeat") as CalendarRepeat;
  // Only an address on this site, and a plain local time.
  if (!/^\/[\w\-/%.]*$/u.test(path) || path.startsWith("//") || !/^\d{8}T\d{6}$/u.test(start) || !REPEATS.has(repeat)) {
    return new Response("Bad request", { status: 400 });
  }
  const link = new URL(path, url.origin).toString();
  const body = calendarFile({ title, url: link, start, repeat, uid: `${path.replace(/\W+/gu, "-")}-${start}@apostolic.am`, stamp: new Date() });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="hishecum.ics"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
