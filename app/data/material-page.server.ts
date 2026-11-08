import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "./material-detail.server";
import { getPollVotes } from "./poll-votes.server";
import { findPsalmByNumber, findPsalmNeighbors } from "./psalm-neighbors.server";
import { listSavedMaterialIds } from "./saved-materials.server";
import { listMarkedVerses } from "./highlights.server";
import { materialMarks } from "./reading-log.server";
import { getMaterialLayout } from "./material-layouts.server";
import { sourceHash } from "../utils/prayer-layout";
import { isMaterialSection, materialPath, parseItemSegment } from "../utils/material-path";
import { psalmNumber } from "../utils/psalm-number";
import type { MaterialDetail } from "./material-detail.server";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** A material's one canonical address (/psalms/22, /pray/71). */
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

/**
 * Կայքի ներսում նավարկելիս (<էջ>.data) էջի տվյալները բոլորի համար նույնն են, առանց անձնականի, որ
 * Cloudflare-ը և հեռախոսը դրանք պահեն նաև մուտք գործածների (Mini App) համար. անձնականը բրաուզերը
 * բերում է առանձին՝ /api/personal (routes/personal-api.ts)։ Առաջին բացման HTML-ը ներառում է երկուսն էլ։
 */
export function isPageDataRequest(request: Request) {
  return new URL(request.url).pathname.endsWith(".data");
}

/** A material page's data, for its readable (/psalms/22) and old (/materials/…) addresses. */
export async function loadMaterialPage(materialId: string | null, request: Request) {
  if (!materialId || !/^material_[a-zA-Z0-9_-]{1,220}$/.test(materialId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const shared = isPageDataRequest(request);
  const [material, user] = await Promise.all([
    getPublicMaterialDetail(env.DB, materialId, request.signal),
    shared ? Promise.resolve(null) : getOptionalTelegramUser(request),
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
  const contentCategory = resolveContentCategoryId(null, material.categoryName);
  const isPsalm = contentCategory === "category_psalms";
  const isPrayer = contentCategory === "category_prayers";
  const hasAudio = material.media.some((asset) => asset.url && (asset.kind === "audio" || asset.kind === "voice"));
  const psalmReference = isPsalm || hasAudio ? parseMaterialId(material.id) : null;
  const prayerReference = isPrayer ? parseMaterialId(material.id) : null;
  const pollReference = material.poll ? parseMaterialId(material.id) : null;
  const [psalm, psalmTimings, savedLayout, personal, publicPollVotes] = await Promise.all([
    isPsalm ? findPsalmNeighbors(env.DB, material.categorySlug, material.id).catch(() => null) : Promise.resolve(null),
    // Ձայնագրության տողերի ժամանակները (սաղմոս կամ ձայնագրություն ունեցող ցանկացած նյութ, օր.՝ աղոթք)
    psalmReference
      ? env.DB.prepare("SELECT starts_json FROM psalm_timings WHERE chat_id = ? AND message_id = ?").bind(psalmReference.chatId, psalmReference.messageId)
        .first<{ starts_json: string }>().then((row) => row ? JSON.parse(row.starts_json) as Array<number | null> : null).catch(() => null)
      : Promise.resolve(null),
    // Աղոթքի ձևավորումը (եթե ադմինը ձևավորել է)
    prayerReference ? getMaterialLayout(env.DB, prayerReference).catch(() => null) : Promise.resolve(null),
    shared ? Promise.resolve(EMPTY_MATERIAL_PERSONAL) : loadMaterialPersonal(material, user, request),
    // Հարցման ընդհանուր արդյունքները (առանց ընթերցողի ձայնի)՝ անանուն ընթերցողի համար
    shared && pollReference && material.poll
      ? getPollVotes(env.DB, pollReference.chatId, pollReference.messageId, material.poll.options.length, null).catch(() => null)
      : Promise.resolve(null),
  ]);
  const layout = savedLayout?.layout ?? null;
  // Link previews point at this address's own pictures (staging's at staging).
  return { origin: address.origin, material, canonicalPath: canonical, psalm, psalmTimings, layout, ...personal, pollVotes: personal.pollVotes ?? publicPollVotes };
}

export type MaterialPersonal = {
  canSave: boolean;
  savedIds: string[];
  pollVotes: Awaited<ReturnType<typeof getPollVotes>> | null;
  canMarkPsalm: boolean;
  readMarks: Awaited<ReturnType<typeof materialMarks>>;
  savedVerses: Awaited<ReturnType<typeof listMarkedVerses>>;
  canLayout: boolean;
  layoutStale: boolean;
};

/** Անանուն ընթերցողի (և ընդհանուր .data-ի) անձնական մասը։ */
export const EMPTY_MATERIAL_PERSONAL: MaterialPersonal = {
  canSave: false, savedIds: [], pollVotes: null, canMarkPsalm: false, readMarks: [], savedVerses: [], canLayout: false, layoutStale: false,
};

/** Ընթերցողի անձնականը մեկ նյութի համար. պահածներ, նշումներ, հարցման ձայնը, ադմինի իրավունքները։ */
export async function loadMaterialPersonal(material: MaterialDetail, user: Awaited<ReturnType<typeof getOptionalTelegramUser>>, request: Request): Promise<MaterialPersonal> {
  const contentCategory = resolveContentCategoryId(null, material.categoryName);
  const isPsalm = contentCategory === "category_psalms";
  const isPrayer = contentCategory === "category_prayers";
  const hasAudio = material.media.some((asset) => asset.url && (asset.kind === "audio" || asset.kind === "voice"));
  const reference = parseMaterialId(material.id);
  if (!reference) return EMPTY_MATERIAL_PERSONAL;
  const [pollVotes, admin] = await Promise.all([
    // Հարցման արդյունքները (ձայներով)՝ միշտ թարմ, ընթերցողի ձայնով
    material.poll
      ? getPollVotes(env.DB, reference.chatId, reference.messageId, material.poll.options.length, user?.id ?? null).catch(() => null)
      : Promise.resolve(null),
    // Ադմինը կարող է մտած լինել նաև Cloudflare Access-ով (առանց կայքի հաշվի)
    getOptionalTelegramAdmin(request, env.DB).catch(() => null),
  ]);
  const canMarkPsalm = (isPsalm || hasAudio) && can(admin, "psalms");
  if (!user) return { ...EMPTY_MATERIAL_PERSONAL, pollVotes, canMarkPsalm };
  const [savedIds, readMarks, savedVerses, savedLayout] = await Promise.all([
    listSavedMaterialIds(env.DB, user.id),
    // When this reader marked the material as read (the page compares with their local date).
    materialMarks(env.DB, user.id, reference.chatId, reference.messageId).catch(() => []),
    // The verses of this psalm the reader saved (the verse popup's "Պահել").
    isPsalm || hasAudio ? listMarkedVerses(env.DB, user.id, reference.chatId, reference.messageId).catch(() => []) : Promise.resolve([]),
    isPrayer && can(admin, "layout") ? getMaterialLayout(env.DB, reference).catch(() => null) : Promise.resolve(null),
  ]);
  const canLayout = isPrayer && can(admin, "layout");
  return {
    canSave: true,
    savedIds,
    pollVotes,
    canMarkPsalm,
    readMarks,
    savedVerses,
    canLayout,
    // Telegram-ում տեքստը փոխվել է ձևավորելուց հետո. ցույց է տրվում միայն ադմինին։
    layoutStale: Boolean(canLayout && savedLayout && savedLayout.sourceHash !== sourceHash(material)),
  };
}
