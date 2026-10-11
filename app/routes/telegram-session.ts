import { env } from "cloudflare:workers";

import type { Route } from "./+types/telegram-session";
import {
  createTelegramSession,
  requireSameOriginUserRequest,
  upsertAppUser,
} from "../auth/telegram-user.server";

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ authenticated: false }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as {
    initData?: unknown;
  } | null;
  if (typeof body?.initData !== "string") {
    return Response.json({ authenticated: false }, { status: 400 });
  }

  const session = await createTelegramSession(request, body.initData);
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  await upsertAppUser(env.DB, session.user);
  return Response.json(
    { authenticated: true },
    { headers: { "Set-Cookie": session.cookie } },
  );
}
