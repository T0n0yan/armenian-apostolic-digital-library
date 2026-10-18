import { env } from "cloudflare:workers";

import type { Route } from "./+types/auth-google-callback";
import { finishGoogleSignIn } from "../auth/google.server";
import { createSessionCookie, upsertAppUser } from "../auth/telegram-user.server";

/** Google sends the reader back here; signs them in and returns them where they started. */
export async function loader({ request }: Route.LoaderArgs) {
  const { profile, returnTo, clearState } = await finishGoogleSignIn(request);
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearState);
  if (!profile) {
    headers.set("location", `/saved?signin=failed`);
    return new Response(null, { status: 302, headers });
  }
  const identity = { id: `google:${profile.sub}`, telegramId: `google:${profile.sub}`, displayName: profile.name, username: profile.email };
  const cookie = await createSessionCookie(request, { ...identity, provider: "google" });
  if (!cookie) {
    headers.set("location", `/saved?signin=failed`);
    return new Response(null, { status: 302, headers });
  }
  await upsertAppUser(env.DB, { ...identity, source: "google" });
  headers.append("set-cookie", cookie);
  headers.set("location", returnTo);
  return new Response(null, { status: 302, headers });
}
