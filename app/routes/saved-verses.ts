import { env } from "cloudflare:workers";

import type { Route } from "./+types/saved-verses";
import { requireSameOriginUserRequest, requireTelegramUser, upsertAppUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath } from "../data/material-page.server";
import { setVerseSaved } from "../data/saved-verses.server";
import { psalmBodyText } from "../utils/material-title";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** Saves ({ materialId, verse, saved: true }) or removes a psalm verse in the reader's «Իմ անկյունը». */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; verse?: unknown; saved?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  const number = typeof body?.verse === "number" && Number.isInteger(body.verse) && body.verse > 0 && body.verse < 1000 ? body.verse : null;
  if (!reference || !number || typeof body?.saved !== "boolean") return Response.json({ ok: false }, { status: 400 });
  await upsertAppUser(env.DB, user);
  if (!body.saved) {
    await setVerseSaved(env.DB, user.id, reference.chatId, reference.messageId, { number, text: "", label: "", path: "" }, false);
    return Response.json({ ok: true, saved: false });
  }
  // The verse's text is taken from the psalm itself, not from the request.
  const material = await getPublicMaterialDetail(env.DB, body.materialId as string, request.signal);
  if (!material || resolveContentCategoryId(null, material.categoryName) !== "category_psalms") return Response.json({ ok: false }, { status: 404 });
  const verse = psalmVerseList(psalmBodyText(material)).find((item) => item.number === number);
  if (!verse) return Response.json({ ok: false }, { status: 404 });
  const psalmPath = canonicalMaterialPath(material);
  await setVerseSaved(env.DB, user.id, reference.chatId, reference.messageId, {
    number, text: verse.text, label: verseLabel(psalmPath, material.title, number), path: `${psalmPath}/${number}`,
  }, true);
  return Response.json({ ok: true, saved: true });
}
