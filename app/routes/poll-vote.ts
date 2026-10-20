import { env } from "cloudflare:workers";

import type { Route } from "./+types/poll-vote";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { getCloudLibraryPost } from "../data/cloud-library.server";
import { castPollVote, getPollVotes } from "../data/poll-votes.server";
import { logReading, validDay } from "../data/reading-log.server";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

/** { materialId, option } — votes on a poll in the library; answers with the updated votes. */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; option?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  const option = typeof body?.option === "number" && Number.isInteger(body.option) ? body.option : -1;
  if (!reference) return Response.json({ ok: false }, { status: 400 });
  const post = await getCloudLibraryPost(env.DB, reference.chatId, reference.messageId);
  if (!post?.poll || post.poll.closed || option < 0 || option >= post.poll.options.length) return Response.json({ ok: false }, { status: 400 });
  await castPollVote(env.DB, user.id, reference.chatId, reference.messageId, option);
  const day = validDay((body as { day?: unknown } | null)?.day);
  if (day) await logReading(env.DB, { userId: user.id, day, chatId: reference.chatId, messageId: reference.messageId, kind: "quiz" });
  const votes = await getPollVotes(env.DB, reference.chatId, reference.messageId, post.poll.options.length, user.id);
  return Response.json({ ok: true, votes }, { headers: { "Cache-Control": "private, no-store" } });
}
