import { parseMaterialId } from "../../shared/telegram-bridge-contract";
import { listUnclassifiedBridgePosts } from "./telegram-bridge.server";

export type TelegramReviewItem = {
  id: string;
  materialId: string;
  title: string;
  telegramUrl: string;
  sourceTitle: string;
  topicId: number | null;
  reason: string;
  createdAt: string;
};

export async function listPendingTelegramReviews(database: D1Database) {
  const page = await listUnclassifiedBridgePosts(database);
  return page.posts.map((post): TelegramReviewItem => ({
    id: `review_${post.id}`,
    materialId: post.id,
    title: post.title,
    telegramUrl: post.telegramUrl,
    sourceTitle: post.chatId,
    topicId: post.forumTopicId,
    reason: "unclassified",
    createdAt: post.publishedAt ?? new Date(0).toISOString(),
  }));
}

export async function resolveTelegramReview(
  database: D1Database,
  reviewId: string,
  categoryId: string,
  forumTopicId: number | null = null,
) {
  const reference = parseMaterialId(reviewId.replace(/^review_/u, ""));
  if (!reference) return false;
  const category = await database.prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1")
    .bind(categoryId).first<{ id: string }>();
  if (!category) return false;
  const statements: D1PreparedStatement[] = [];
  if (forumTopicId !== null) {
    const fallbackSourceId = `telegram_source_${reference.chatId.replace(/[^a-zA-Z0-9_-]/gu, "_")}`;
    await database.prepare(
      `INSERT INTO telegram_sources (id, chat_id, title, chat_type)
       VALUES (?, ?, ?, 'channel')
       ON CONFLICT(chat_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    ).bind(fallbackSourceId, reference.chatId, `Telegram ${reference.chatId}`).run();
    const source = await database.prepare("SELECT id FROM telegram_sources WHERE chat_id=?")
      .bind(reference.chatId).first<{ id: string }>();
    if (!source) return false;
    statements.push(
      database.prepare(
        `INSERT INTO telegram_topics (source_id, topic_id, title, category_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source_id, topic_id) DO UPDATE SET
           category_id = excluded.category_id, updated_at = CURRENT_TIMESTAMP`,
      ).bind(source.id, forumTopicId, `Telegram topic ${forumTopicId}`, categoryId),
    );
  } else {
    statements.push(
      database.prepare(
        `INSERT INTO telegram_post_category_mappings (chat_id, message_id, category_id)
         VALUES (?, ?, ?)
         ON CONFLICT(chat_id, message_id) DO UPDATE SET
           category_id = excluded.category_id, updated_at = CURRENT_TIMESTAMP`,
      ).bind(reference.chatId, reference.messageId, categoryId),
    );
  }
  statements.push(
    database.prepare(
      `INSERT INTO telegram_review_items (chat_id, message_id, forum_topic_id, reason, status, resolved_at)
       VALUES (?, ?, ?, 'unclassified', 'resolved', CURRENT_TIMESTAMP)
       ON CONFLICT(chat_id, message_id) DO UPDATE SET
         status = 'resolved', resolved_at = CURRENT_TIMESTAMP`,
    ).bind(reference.chatId, reference.messageId, forumTopicId),
  );
  await database.batch(statements);
  return true;
}
