import { env } from "cloudflare:workers";

import type { Route } from "./+types/auth-google-callback";
import { finishGoogleSignIn } from "../auth/google.server";
import { createSessionCookie, upsertAppUser } from "../auth/telegram-user.server";
import { linkedAccount } from "../data/account-links.server";

/** Google sends the reader back here; signs them in and returns them where they started. */
export async function loader({ request }: Route.LoaderArgs) {
  const { profile, returnTo, clearState, cancelled } = await finishGoogleSignIn(request);
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearState);
  if (!profile) {
    headers.set("location", cancelled ? returnTo : `/saved?signin=failed`);
    return new Response(null, { status: 302, headers });
  }
  const google = { id: `google:${profile.sub}`, telegramId: `google:${profile.sub}`, displayName: profile.name, username: profile.email };
  // A Google account joined to a Telegram account opens that one.
  const linked = await linkedAccount(env.DB, google.id);
  const identity = linked ? { id: linked.id, telegramId: linked.telegram_id, displayName: linked.display_name, username: linked.username } : google;
  const provider = linked ? "telegram" as const : "google" as const;
  const cookie = await createSessionCookie(request, { ...identity, provider });
  if (!cookie) {
    headers.set("location", cancelled ? returnTo : `/saved?signin=failed`);
    return new Response(null, { status: 302, headers });
  }
  if (!linked) await upsertAppUser(env.DB, { ...identity, source: "google" });
  headers.append("set-cookie", cookie);
  headers.set("location", returnTo);
  return new Response(null, { status: 302, headers });
}
