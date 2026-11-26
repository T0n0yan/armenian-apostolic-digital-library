import { env } from "cloudflare:workers";

import type { Route } from "./+types/etiquette-links-api";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { etiquetteTopic } from "../data/etiquette";
import { LINK_LIMITS, addEtiquetteLink, cleanLinkUrl, countRuleLinks, deleteEtiquetteLink } from "../data/etiquette-links.server";
import { bumpCacheEpoch } from "../data/site-refresh.server";

/**
 * Կանոնին հղում կցել ({ action: "add", topic, ruleId, url, title }) կամ ջնջել ({ action: "delete", id })։
 * Միայն «layout» իրավունքով ադմինները։
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const admin = await getOptionalTelegramAdmin(request, env.DB);
  if (!can(admin, "layout")) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === "delete") {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ ok: false, error: "bad-id" }, { status: 400 });
    await deleteEtiquetteLink(env.DB, id);
  } else if (body?.action === "add") {
    const topic = etiquetteTopic(typeof body.topic === "string" ? body.topic : "");
    const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
    if (!topic || !topic.rules.some((rule) => rule.id === ruleId)) return Response.json({ ok: false, error: "bad-rule" }, { status: 400 });
    const url = cleanLinkUrl(body.url);
    if (!url) return Response.json({ ok: false, error: "bad-url" }, { status: 400 });
    const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, LINK_LIMITS.title) || new URL(url).hostname;
    if (await countRuleLinks(env.DB, topic.slug, ruleId) >= LINK_LIMITS.perRule) return Response.json({ ok: false, error: "too-many" }, { status: 400 });
    await addEtiquetteLink(env.DB, { topic: topic.slug, ruleId, url, title, userId: user.id });
  } else {
    return Response.json({ ok: false, error: "bad-action" }, { status: 400 });
  }
  // Պահված էջերը (edge cache, service worker) նորից են բերվում։
  await bumpCacheEpoch(env.DB).catch(() => null);
  return Response.json({ ok: true });
}
