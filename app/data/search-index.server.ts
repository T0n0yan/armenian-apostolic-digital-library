import { INTRO_TOPICS, mediaVersion } from "./cloud-library.server";
import { mediaUrl } from "./media-url.server";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { materialPath } from "../utils/material-path";
import type { SearchIndex, SearchIndexItem } from "../utils/local-search";

type Row = {
  chat_id: string; message_id: number; material_id: string; title: string; content_type: string;
  number_value: number | null; date_value: string | null; published_at: string | null;
  topic_key: string; topic_title: string; topic_slug: string; first_message_id: number;
  media_index: number | null; media_kind: string | null; media_count: number;
  r2_key: string | null; r2_etag: string | null; thumbnail_r2_key: string | null; thumbnail_etag: string | null;
};

/**
 * Every material's title, section, number and picture, for searching titles on the phone (the
 * texts stay on the server: the whole library's text would be megabytes to download). Plain rows,
 * no normalizing here: the phone does that once per version.
 */
export async function buildSearchIndex(database: D1Database, version: string): Promise<SearchIndex> {
  const { results } = await database.prepare(
    `WITH first_posts AS (
       SELECT topic_key, MIN(message_id) AS first_message_id FROM library_materials
       WHERE sync_state = 'ready' AND deleted_at IS NULL GROUP BY topic_key
     )
     SELECT materials.chat_id, materials.message_id, materials.material_id, materials.title, materials.content_type,
       materials.number_value, materials.date_value, materials.published_at,
       materials.topic_key, topics.title AS topic_title, topics.slug AS topic_slug,
       first_posts.first_message_id,
       media.media_index, media.kind AS media_kind, media.r2_key, media.r2_etag, media.thumbnail_r2_key, media.thumbnail_etag,
       (SELECT COUNT(*) FROM library_media AS counted
         WHERE counted.chat_id = materials.chat_id AND counted.message_id = materials.message_id AND counted.status = 'ready') AS media_count
     FROM library_materials AS materials
     LEFT JOIN first_posts ON first_posts.topic_key = materials.topic_key
     INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
     LEFT JOIN library_media AS media ON media.chat_id = materials.chat_id AND media.message_id = materials.message_id
       AND media.status = 'ready' AND media.media_index = (
         SELECT MIN(inner_media.media_index) FROM library_media AS inner_media
         WHERE inner_media.chat_id = materials.chat_id AND inner_media.message_id = materials.message_id AND inner_media.status = 'ready')
     WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden'
     ORDER BY materials.published_at DESC, materials.message_id DESC`,
  ).all<Row>();
  const items: SearchIndexItem[] = [];
  for (const row of results) {
    const category = resolveContentCategoryId(row.topic_key, row.topic_title);
    // A section's first text post is its introduction, shown above the list, not a result.
    if (row.message_id === row.first_message_id && row.content_type === "text" && !row.media_kind && INTRO_TOPICS.has(category ?? "")) continue;
    const post = { chatId: row.chat_id, messageId: row.message_id };
    const asset = row.media_index === null ? null : {
      index: row.media_index, version: mediaVersion(row), objectKey: row.r2_key, thumbnailObjectKey: row.thumbnail_r2_key,
    };
    const thumbnail = asset && (row.media_kind === "photo" || row.thumbnail_r2_key) ? mediaUrl(post, asset, true) : null;
    items.push([
      row.material_id,
      materialPath(row.material_id, row.topic_title, { title: row.title, psalm: row.number_value }),
      row.title,
      row.topic_key,
      row.number_value,
      row.date_value ?? row.published_at,
      row.content_type,
      thumbnail,
      row.media_count,
    ]);
  }
  return { version, categories: Object.fromEntries(results.map((row) => [row.topic_key, [row.topic_title, row.topic_slug]])), items };
}
