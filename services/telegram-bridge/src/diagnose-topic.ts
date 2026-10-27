/**
 * Read-only check of one topic: every post Telegram has in it, next to what the site's database
 * holds for it (and why a post is missing). Nothing is written.
 *   CLOUD_SYNC_ENV=production node --import tsx services/telegram-bridge/src/diagnose-topic.ts "Աղոթք"
 */
import { GramJsTelegramAdapter } from "./gramjs-adapter";
import { readBridgeConfig } from "./config";
import { query } from "./wrangler-cloud-target";

const wanted = (process.argv[2] ?? "").trim();
const config = readBridgeConfig();
const chatId = config.contentChatId!;
const adapter = new GramJsTelegramAdapter({ apiId: config.apiId!, apiHash: config.apiHash!, session: config.session!, allowedChatIds: [chatId] });
const signal = new AbortController().signal;
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

try {
  await adapter.connect();
  const topics = await adapter.listTopics({ refresh: true, signal });
  const topic = topics.find((item) => item.name.includes(wanted));
  if (!topic?.topicId) throw new Error(`No topic named like «${wanted}». Topics: ${topics.map((item) => item.name).join(", ")}`);
  console.log(`Topic «${topic.name}» (${topic.topicId}), Telegram's message count: ${topic.messageCount ?? "?"}`);

  const posts = [];
  for (let cursor: string | null = null; ;) {
    const page = await adapter.listHistory({ chatId, topicId: topic.topicId, cursor, limit: 50, signal });
    posts.push(...page.posts);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  const stored = new Map((await query<{ message_id: number; sync_state: string; deleted_at: string | null; title: string; topic_key: string }>(
    `SELECT message_id, sync_state, deleted_at, title, topic_key FROM library_materials WHERE chat_id = ${sql(chatId)}`,
  )).map((row) => [row.message_id, row]));
  const failures = await query<{ message_id: number; stage: string; code: string }>(
    `SELECT message_id, stage, code FROM library_sync_failures WHERE chat_id = ${sql(chatId)} ORDER BY rowid DESC LIMIT 200`,
  ).catch(() => []);
  const publishers = await query<{ telegram_user_id: string; status?: string }>(
    `SELECT * FROM library_publishers WHERE chat_id = ${sql(chatId)}`,
  ).catch(() => []);

  console.log(`Posts Telegram returns for the topic: ${posts.length}`);
  let shown = 0;
  for (const post of posts) {
    const row = stored.get(post.messageId);
    const state = !row ? "NOT IN DATABASE" : row.sync_state !== "ready" || row.deleted_at ? `hidden (${row.sync_state})` : "on the site";
    if (state === "on the site") shown += 1;
    const failure = failures.find((item) => item.message_id === post.messageId);
    console.log([
      `#${post.messageId}`, post.contentType, post.media.length ? `${post.media.length} media` : "", post.mediaGroupId ? "album" : "",
      `author=${post.authorId ?? "?"}`, `«${post.title.slice(0, 50)}»`, "→", state, failure ? `failure: ${failure.stage}/${failure.code}` : "",
    ].filter(Boolean).join("  "));
  }
  console.log(`On the site: ${shown} of ${posts.length}.`);
  console.log(`Publishers rows: ${JSON.stringify(publishers).slice(0, 1500)}`);
} finally {
  await adapter.close();
}
