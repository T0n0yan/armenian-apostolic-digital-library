import { listCloudLibraryCategories } from "./cloud-library.server";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { createMaterialExcerpt } from "./materials.server";
import { remember } from "./memory-cache.server";
import { psalmNumber } from "../utils/psalm-number";

export type PsalmLink = { id: string; number: number };
export type PsalmNeighbors = { number: number; previous: PsalmLink | null; next: PsalmLink | null };

/**
 * Սաղմոսների համարները՝ թեթև հարցումով (վերնագիր, տեքստի սկիզբ, առաջին մեդիայի անուն)։ Առաջ բերվում
 * էին բոլոր սաղմոսների ամբողջական տեքստերը և մեդիան, և սաղմոսի էջը cache-ից դուրս ~2 վ էր պատրաստվում։
 * Համարը որոշվում է նույն psalmNumber-ով, ինչ մնացած կայքում։
 */
function listPsalmIndex(database: D1Database, topicSlug: string): Promise<PsalmLink[]> {
  return remember(database, `psalm-index:${topicSlug}`, 60_000, async () => {
    const { results } = await database.prepare(
      `SELECT materials.material_id AS id, materials.title,
         substr(COALESCE(NULLIF(materials.content_text, ''), materials.caption_text, ''), 1, 400) AS text,
         (SELECT COALESCE(media.title, media.file_name) FROM (
            SELECT media_index, title, file_name FROM library_media
            WHERE status = 'ready' AND chat_id = materials.chat_id AND message_id = materials.message_id
            UNION ALL
            SELECT media_index, title, file_name FROM material_attachments
            WHERE chat_id = materials.chat_id AND message_id = materials.message_id
          ) AS media ORDER BY media.media_index LIMIT 1) AS media_title
       FROM library_materials AS materials
       INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
       WHERE topics.slug = ? AND topics.is_general = 0 AND topics.status != 'hidden'
         AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       ORDER BY COALESCE(materials.published_at, '') DESC, materials.message_id DESC`,
    ).bind(topicSlug).all<{ id: string; title: string; text: string; media_title: string | null }>();
    return results
      .map((row) => ({ id: row.id, number: psalmNumber({ title: row.title, excerpt: createMaterialExcerpt(row.text), preview: { mediaTitle: row.media_title } }) }))
      .filter((item): item is PsalmLink => item.number !== null)
      .sort((left, right) => left.number - right.number);
  });
}

/** The psalms just before and after this one, by psalm number, for "previous / next" links. */
export async function findPsalmNeighbors(database: D1Database, topicSlug: string, materialId: string): Promise<PsalmNeighbors | null> {
  const psalms = await listPsalmIndex(database, topicSlug);
  const index = psalms.findIndex((item) => item.id === materialId);
  if (index < 0) return null;
  return { number: psalms[index].number, previous: psalms[index - 1] ?? null, next: psalms[index + 1] ?? null };
}

/** The psalm with this number (/psalms/22), or null. */
export async function findPsalmByNumber(database: D1Database, number: number) {
  const topic = (await listCloudLibraryCategories(database)).find((category) => resolveContentCategoryId(category.id, category.name) === "category_psalms");
  if (!topic) return null;
  return (await listPsalmIndex(database, topic.slug)).find((item) => item.number === number)?.id ?? null;
}
