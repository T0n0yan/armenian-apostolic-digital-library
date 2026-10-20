import { env } from "cloudflare:workers";

let cached: { username: string | null; at: number } | null = null;

/** The bot's @username (from getMe, kept for an hour), or null when no bot is configured. */
export async function botUsername() {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.username;
  const token = (env as { TELEGRAM_BOT_TOKEN?: string }).TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  const result = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    .then((response) => response.json() as Promise<{ ok?: boolean; result?: { username?: string } }>)
    .catch(() => null);
  cached = { username: result?.ok ? result.result?.username ?? null : null, at: Date.now() };
  return cached.username;
}

/** Opens the library's Mini App in Telegram, where the reader is signed in automatically. */
export async function telegramAppLink() {
  const username = await botUsername();
  return username ? `https://t.me/${username}?startapp` : null;
}
