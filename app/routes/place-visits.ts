import { env } from "cloudflare:workers";

import type { Route } from "./+types/place-visits";
import { getOptionalTelegramUser, requireSameOriginUserRequest, requireTelegramUser, upsertAppUser } from "../auth/telegram-user.server";

/** The places the signed-in reader marked «Եղել եմ» (guests: an empty list; theirs live in the browser). */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  if (!user) return Response.json({ signedIn: false, places: [] }, { headers: { "cache-control": "private, no-store" } });
  const { results } = await env.DB.prepare("SELECT place_id FROM place_visits WHERE user_id = ?").bind(user.id).all<{ place_id: string }>();
  return Response.json({ signedIn: true, account: user.id, places: results.map((row) => row.place_id) }, { headers: { "cache-control": "private, no-store" } });
}

/** Marks ({ places: [id…], visited: true }) or unmarks places for the signed-in reader. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { places?: unknown; visited?: unknown } | null;
  const places = Array.isArray(body?.places) ? body.places.filter((id): id is string => typeof id === "string" && /^[a-z0-9-]{1,80}$/u.test(id)).slice(0, 500) : [];
  if (!places.length || typeof body?.visited !== "boolean") return Response.json({ ok: false }, { status: 400 });
  await upsertAppUser(env.DB, user);
  const statement = body.visited
    // Only places that exist and are published can be marked.
    ? env.DB.prepare("INSERT OR IGNORE INTO place_visits (user_id, place_id) SELECT ?, id FROM places WHERE id = ? AND published = 1")
    : env.DB.prepare("DELETE FROM place_visits WHERE user_id = ? AND place_id = ?");
  await env.DB.batch(places.map((id) => statement.bind(user.id, id)));
  return Response.json({ ok: true });
}
