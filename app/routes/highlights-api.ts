import { env } from "cloudflare:workers";

import type { Route } from "./+types/highlights-api";
import { getOptionalTelegramUser, requireSameOriginUserRequest, requireTelegramUser, upsertAppUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath } from "../data/material-page.server";
import {
  createHighlight, deleteHighlight, listHighlights, listMaterialHighlights, openQuestionCount, updateHighlight, type HighlightChange,
} from "../data/highlights.server";
import { CONTEXT_LENGTH, NOTE_MAX, QUOTE_MAX, cleanEmoji, type HighlightKind } from "../utils/highlights";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";

const noStore = { "cache-control": "private, no-store" };

/** GET ?materialId=… — մեկ նյութի նշումները. ?questions=1 — չպատասխանված հարցերի թիվը. ?q=… — որոնում նշումներում։ */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  if (!user) return Response.json({ ok: false, signedIn: false, highlights: [], openQuestions: 0 }, { headers: noStore });
  const url = new URL(request.url);
  // Որոնում իմ նշումներում (տող, նշում, պատասխան, նյութի անուն)։
  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("hy").slice(0, 120);
  if (query.length >= 2) {
    const found = (await listHighlights(env.DB, user.id)).filter((item) =>
      [item.quote, item.note, item.answer, item.title].some((text) => text.toLocaleLowerCase("hy").includes(query)));
    return Response.json({ ok: true, total: found.length, highlights: found.slice(0, 6) }, { headers: noStore });
  }
  if (url.searchParams.get("questions")) {
    return Response.json({ ok: true, openQuestions: await openQuestionCount(env.DB, user.id) }, { headers: noStore });
  }
  const reference = parseMaterialId(url.searchParams.get("materialId") ?? "");
  if (!reference) return Response.json({ ok: false }, { status: 400, headers: noStore });
  const highlights = await listMaterialHighlights(env.DB, user.id, reference.chatId, reference.messageId);
  return Response.json({ ok: true, highlights }, { headers: noStore });
}

function isKind(value: unknown): value is HighlightKind {
  return value === "mark" || value === "question";
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/**
 * POST { action: "create", materialId, quote, prefix, suffix, kind, emoji?, note?, verse? }
 * POST { action: "update", id, kind?, emoji?, note?, answer?, answered? }
 * POST { action: "delete", id }
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return Response.json({ ok: false }, { status: 400 });

  if (body.action === "create") {
    const reference = typeof body.materialId === "string" ? parseMaterialId(body.materialId) : null;
    const quote = typeof body.quote === "string" ? body.quote.trim() : "";
    const emoji = cleanEmoji(body.emoji ?? "");
    const kind = body.kind === undefined ? "mark" : body.kind;
    if (!reference || !quote || quote.length > QUOTE_MAX || emoji === null || !isKind(kind)) return Response.json({ ok: false }, { status: 400 });
    // Բաժինը, անունը և հասցեն վերցվում են նյութից, ոչ թե հարցումից։
    const material = await getPublicMaterialDetail(env.DB, body.materialId as string, request.signal);
    if (!material) return Response.json({ ok: false }, { status: 404 });
    await upsertAppUser(env.DB, user);
    const highlight = await createHighlight(env.DB, user.id, {
      chatId: reference.chatId, messageId: reference.messageId, kind, quote,
      prefix: text(body.prefix, CONTEXT_LENGTH) ?? "", suffix: text(body.suffix, CONTEXT_LENGTH) ?? "",
      emoji, note: text(body.note, NOTE_MAX) ?? "",
      section: material.categoryName ?? "", title: material.title, path: canonicalMaterialPath(material),
      verse: typeof body.verse === "number" && Number.isInteger(body.verse) && body.verse > 0 && body.verse < 1000 ? body.verse : null,
    });
    if (!highlight) return Response.json({ ok: false, reason: "limit" }, { status: 409 });
    return Response.json({ ok: true, highlight });
  }

  const id = typeof body.id === "string" && body.id.length <= 64 ? body.id : null;
  if (!id) return Response.json({ ok: false }, { status: 400 });

  if (body.action === "delete") {
    await deleteHighlight(env.DB, user.id, id);
    return Response.json({ ok: true });
  }

  if (body.action === "update") {
    const change: HighlightChange = {};
    if (body.kind !== undefined) { if (!isKind(body.kind)) return Response.json({ ok: false }, { status: 400 }); change.kind = body.kind; }
    if (body.emoji !== undefined) { const emoji = cleanEmoji(body.emoji); if (emoji === null) return Response.json({ ok: false }, { status: 400 }); change.emoji = emoji; }
    if (body.note !== undefined) change.note = text(body.note, NOTE_MAX) ?? "";
    if (body.answer !== undefined) change.answer = text(body.answer, NOTE_MAX) ?? "";
    if (typeof body.answered === "boolean") change.answered = body.answered;
    const highlight = await updateHighlight(env.DB, user.id, id, change);
    if (!highlight) return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true, highlight });
  }
  return Response.json({ ok: false }, { status: 400 });
}
