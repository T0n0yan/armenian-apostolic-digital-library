import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { getOptionalTelegramAdmin } from "../auth/admin.server";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "./material-detail.server";
import { getPollVotes } from "./poll-votes.server";
import { findPsalmByNumber, findPsalmNeighbors } from "./psalm-neighbors.server";
import { listSavedMaterialIds } from "./saved-materials.server";
import { listSavedVerseNumbers } from "./saved-verses.server";
import { materialMarks } from "./reading-log.server";
import { isMaterialSection, materialPath, parseItemSegment } from "../utils/material-path";
import { psalmNumber } from "../utils/psalm-number";
import type { MaterialDetail } from "./material-detail.server";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** A material's one canonical address (/saghmosner/22, /aghotkner/364-aghotk-yntaniki). */
export function canonicalMaterialPath(material: Pick<MaterialDetail, "id" | "title" | "categoryName" | "contentText" | "media">) {
  const mediaTitle = material.media.find((asset) => asset.kind === "audio" || asset.kind === "voice")?.title ?? null;
  const psalm = resolveContentCategoryId(null, material.categoryName) === "category_psalms"
    ? psalmNumber({ title: material.title, excerpt: material.contentText, preview: { mediaTitle } })
    : null;
  return materialPath(material.id, material.categoryName, { title: material.title, psalm });
}

/** The material an address names: /materials/<id> or /<section>/<item>. */
export async function resolveMaterialId(params: { materialId?: string; section?: string; item?: string }) {
  if (params.materialId) return params.materialId;
  if (!params.section || !params.item || !isMaterialSection(params.section)) return null;
  const parsed = parseItemSegment(params.section, params.item);
  if (!parsed) return null;
  return "psalm" in parsed ? await findPsalmByNumber(env.DB, parsed.psalm) : parsed.materialId;
}

/** A material page's data, for its readable (/saghmosner/22) and old (/materials/…) addresses. */
export async function loadMaterialPage(materialId: string | null, request: Request) {
  if (!materialId || !/^material_[a-zA-Z0-9_-]{1,220}$/.test(materialId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const [material, user] = await Promise.all([
    getPublicMaterialDetail(env.DB, materialId, request.signal),
    getOptionalTelegramUser(request),
  ]);
  if (!material) throw new Response("Not Found", { status: 404 });
  // Old and inexact addresses move permanently to the material's one readable address.
  const address = new URL(request.url);
  const canonical = canonicalMaterialPath(material);
  // Data requests for client navigation end in ".data"; compare the page's own path.
  const pathname = address.pathname.replace(/\.data$/u, "");
  if (decodeURIComponent(pathname) !== canonical) {
    const search = new URLSearchParams(address.search);
    search.delete("_routes");
    const query = search.toString();
    throw redirect(`${canonical}${query ? `?${query}` : ""}`, 301);
  }
  const isPsalm = resolveContentCategoryId(null, material.categoryName) === "category_psalms";
  const [savedIds, psalm] = await Promise.all([
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
    isPsalm ? findPsalmNeighbors(env.DB, material.categorySlug, material.id).catch(() => null) : Promise.resolve(null),
  ]);
  const reference = material.poll ? parseMaterialId(material.id) : null;
  const pollVotes = reference && material.poll
    ? await getPollVotes(env.DB, reference.chatId, reference.messageId, material.poll.options.length, user?.id ?? null).catch(() => null)
    : null;
  // A psalm's marked verse timings, and whether this reader may mark them.
  const psalmReference = isPsalm ? parseMaterialId(material.id) : null;
  const [psalmTimings, canMarkPsalm] = psalmReference ? await Promise.all([
    env.DB.prepare("SELECT starts_json FROM psalm_timings WHERE chat_id = ? AND message_id = ?").bind(psalmReference.chatId, psalmReference.messageId)
      .first<{ starts_json: string }>().then((row) => row ? JSON.parse(row.starts_json) as Array<number | null> : null).catch(() => null),
    getOptionalTelegramAdmin(request, env.DB).then(Boolean).catch(() => false),
  ]) : [null, false];
  // When this reader marked the material as read (the page compares with their local date).
  const own = user ? parseMaterialId(material.id) : null;
  const readMarks = user && own ? await materialMarks(env.DB, user.id, own.chatId, own.messageId).catch(() => []) : [];
  // The verses of this psalm the reader saved (the verse popup's "Պահել").
  const savedVerses = user && psalmReference ? await listSavedVerseNumbers(env.DB, user.id, psalmReference.chatId, psalmReference.messageId).catch(() => []) : [];
  return { material, canonicalPath: canonical, canSave: Boolean(user), savedIds, psalm, pollVotes, psalmTimings, canMarkPsalm, readMarks, savedVerses };
}
