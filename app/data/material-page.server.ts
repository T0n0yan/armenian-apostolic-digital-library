import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { getOptionalTelegramAdmin } from "../auth/admin.server";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { getPublicMaterialDetail } from "./material-detail.server";
import { getPollVotes } from "./poll-votes.server";
import { findPsalmNeighbors } from "./psalm-neighbors.server";
import { listSavedMaterialIds } from "./saved-materials.server";
import { materialPath } from "../utils/material-path";
import { parseMaterialId, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** A material page's data, for its long (/materials/…) and short (/pray_364) addresses. */
export async function loadMaterialPage(materialId: string | null, request: Request) {
  if (!materialId || !/^material_[a-zA-Z0-9_-]{1,220}$/.test(materialId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const [material, user] = await Promise.all([
    getPublicMaterialDetail(env.DB, materialId, request.signal),
    getOptionalTelegramUser(request),
  ]);
  if (!material) throw new Response("Not Found", { status: 404 });
  // Old long links and wrong prefixes move to the material's one short address.
  const address = new URL(request.url);
  const canonical = materialPath(material.id, material.categoryName);
  if (address.pathname !== canonical) throw redirect(`${canonical}${address.search}`);
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
  return { material, canSave: Boolean(user), savedIds, psalm, pollVotes, psalmTimings, canMarkPsalm };
}
