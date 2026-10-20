import { telegramAppLink } from "../data/telegram-bot.server";

/** The Mini App link for "Մուտք Telegram-ով", asked for by the sign-in card only when shown. */
export async function loader() {
  const url = await telegramAppLink().catch(() => null);
  return Response.json({ url }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
