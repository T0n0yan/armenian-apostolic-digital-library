import { env } from "cloudflare:workers";

import type { Route } from "./+types/sunday-api";
import { getOptionalTelegramUser, requireSameOriginUserRequest, requireTelegramUser, upsertAppUser } from "../auth/telegram-user.server";
import { saveSundayAnswer, setSundayPrompt, sundayPromptOn, sundayQuestion } from "../data/liturgy.server";
import { sundayToAsk } from "../utils/liturgy";

const privateJson = { "Cache-Control": "private, no-store" };

/** Հարցնե՞լ հիմա (կիրակի 13:00 → երկուշաբթի) և արդյոք հարցը միացված է։ */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  if (!user) return Response.json({ signedIn: false, ask: false, day: null, promptOn: false }, { headers: privateJson });
  const [question, promptOn] = await Promise.all([sundayQuestion(env.DB, user.id), sundayPromptOn(env.DB, user.id)]);
  return Response.json({ signedIn: true, ...question, promptOn }, { headers: privateJson });
}

/**
 * { attended, communion } — պատասխանը այս կիրակիի համար,
 * { prompt: false | true } — «Չհարցնել այլևս» կամ նորից միացնել։
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { attended?: unknown; communion?: unknown; prompt?: unknown } | null;
  await upsertAppUser(env.DB, user);
  if (typeof body?.prompt === "boolean") {
    await setSundayPrompt(env.DB, user.id, body.prompt);
    return Response.json({ ok: true }, { headers: privateJson });
  }
  const day = sundayToAsk();
  if (!day || typeof body?.attended !== "boolean") return Response.json({ ok: false }, { status: 400, headers: privateJson });
  await saveSundayAnswer(env.DB, user.id, day, body.attended, body.communion === true);
  return Response.json({ ok: true, day }, { headers: privateJson });
}
