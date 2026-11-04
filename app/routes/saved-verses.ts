import { env } from "cloudflare:workers";

import type { Route } from "./+types/saved-verses";
import { requireSameOriginUserRequest, requireTelegramUser, upsertAppUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath } from "../data/material-page.server";
import { setVerseMarked } from "../data/highlights.server";
import { psalmBodyText } from "../utils/material-title";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** Սաղմոսի համարի պատուհանից. նշում է ամբողջ համարը ({ materialId, verse, saved: true }) «Իմ նշումները»-ում կամ հանում։ */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as { materialId?: unknown; verse?: unknown; saved?: unknown } | null;
  const reference = typeof body?.materialId === "string" ? parseMaterialId(body.materialId) : null;
  const number = typeof body?.verse === "number" && Number.isInteger(body.verse) && body.verse > 0 && body.verse < 1000 ? body.verse : null;
  if (!reference || !number || typeof body?.saved !== "boolean") return Response.json({ ok: false }, { status: 400 });
  await upsertAppUser(env.DB, user);
  const base = { chatId: reference.chatId, messageId: reference.messageId, verse: number };
  if (!body.saved) {
    await setVerseMarked(env.DB, user.id, { ...base, quote: "", section: "", title: "", path: "" }, false);
    return Response.json({ ok: true, saved: false });
  }
  // The verse's text is taken from the psalm itself, not from the request.
  const material = await getPublicMaterialDetail(env.DB, body.materialId as string, request.signal);
  if (!material || resolveContentCategoryId(null, material.categoryName) !== "category_psalms") return Response.json({ ok: false }, { status: 404 });
  const verse = psalmVerseList(psalmBodyText(material)).find((item) => item.number === number);
  if (!verse) return Response.json({ ok: false }, { status: 404 });
  const psalmPath = canonicalMaterialPath(material);
  const highlight = await setVerseMarked(env.DB, user.id, {
    ...base, quote: verse.text.trim().slice(0, 1200), section: material.categoryName ?? "Սաղմոսներ",
    title: verseLabel(psalmPath, material.title, number), path: psalmPath,
  }, true);
  if (!highlight) return Response.json({ ok: false, reason: "limit" }, { status: 409 });
  return Response.json({ ok: true, saved: true });
}
