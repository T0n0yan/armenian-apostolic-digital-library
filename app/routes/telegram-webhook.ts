import { env } from "cloudflare:workers";

import type { Route } from "./+types/telegram-webhook";
import { handleTelegramWebhook } from "../data/telegram-bot.server";

export async function action({ request }: Route.ActionArgs) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }
  return handleTelegramWebhook(request, env.DB);
}

export function loader() {
  throw new Response("Method Not Allowed", { status: 405 });
}
