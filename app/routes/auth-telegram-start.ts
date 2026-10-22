import type { Route } from "./+types/auth-telegram-start";
import { safeReturnPath } from "../auth/google.server";
import { telegramBotId } from "../auth/telegram-user.server";

/**
 * Starts Telegram sign-in in a browser: Telegram's own page (oauth.telegram.org) asks the reader to
 * confirm and returns to /auth/telegram with the signed result. The bot must have this site's
 * domain set in BotFather (/setdomain).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get("return"));
  const botId = telegramBotId();
  if (!botId) return new Response(null, { status: 302, headers: { location: "/saved?signin=failed", "cache-control": "no-store" } });
  const target = new URL("https://oauth.telegram.org/auth");
  target.searchParams.set("bot_id", botId);
  target.searchParams.set("origin", url.origin);
  // Lets the bot send the reader their reading reminders.
  target.searchParams.set("request_access", "write");
  target.searchParams.set("return_to", `${url.origin}/auth/telegram?return=${encodeURIComponent(returnTo)}`);
  return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
}
