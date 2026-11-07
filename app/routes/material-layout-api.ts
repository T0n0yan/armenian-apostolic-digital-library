import { env } from "cloudflare:workers";

import type { Route } from "./+types/material-layout-api";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { deleteMaterialLayout, saveMaterialLayout } from "../data/material-layouts.server";
import { bumpCacheEpoch } from "../data/site-refresh.server";
import { LAYOUT_LIMITS, sanitizeLayout, sourceHash } from "../utils/prayer-layout";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/**
 * Աղոթքի ձևավորումը պահել ({ materialId, layout }) կամ ջնջել ({ materialId, layout: null })՝
 * վերադառնալով Telegram-ի տեքստին։ Միայն «layout» իրավունքով ադմինները։
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const admin = await getOptionalTelegramAdmin(request, env.DB);
  if (!can(admin, "layout")) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > LAYOUT_LIMITS.json) return Response.json({ ok: false, error: "too-large" }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw) as { materialId?: unknown; layout?: unknown }; } catch { return null; } })();
  const materialId = typeof body?.materialId === "string" ? body.materialId : "";
  const reference = parseMaterialId(materialId);
  if (!reference) return Response.json({ ok: false, error: "bad-material" }, { status: 400 });
  const material = await getPublicMaterialDetail(env.DB, materialId, request.signal);
  if (!material || resolveContentCategoryId(null, material.categoryName) !== "category_prayers") {
    return Response.json({ ok: false, error: "not-prayer" }, { status: 404 });
  }
  if (body?.layout === null) {
    await deleteMaterialLayout(env.DB, reference);
  } else {
    const layout = sanitizeLayout(body?.layout);
    if (!layout) return Response.json({ ok: false, error: "bad-layout" }, { status: 400 });
    await saveMaterialLayout(env.DB, reference, layout, sourceHash(material), user.id);
  }
  // Պահված էջերը (edge cache, հեռախոսների service worker) նորից են բերվում։
  await bumpCacheEpoch(env.DB).catch(() => null);
  return Response.json({ ok: true });
}
