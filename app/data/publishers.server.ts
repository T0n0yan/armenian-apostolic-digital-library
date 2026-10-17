export type Publisher = {
  telegramUserId: string;
  displayName: string;
  username: string | null;
  source: "telegram_admin" | "manual";
  status: "allowed" | "blocked";
};

export type WithheldAuthor = {
  telegramUserId: string;
  displayName: string;
  postCount: number;
  withheldCount: number;
  lastPostAt: string | null;
};

export type SiteAdminCandidate = {
  id: string;
  telegramId: string;
  displayName: string;
  username: string | null;
  role: "member" | "admin";
  lastSeenAt: string;
};

export type SyncOverview = {
  lastRun: { mode: string; status: string; startedAt: string; completedAt: string | null } | null;
  readyMaterials: number;
  pendingFailures: number;
};

const telegramIdPattern = /^\d{3,20}$/u;

export function isTelegramUserId(value: unknown): value is string {
  return typeof value === "string" && telegramIdPattern.test(value);
}

/** The single active content forum; publishers and authors are scoped to it. */
export async function getContentChatId(database: D1Database) {
  const row = await database.prepare(
    "SELECT chat_id FROM library_sources WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1",
  ).first<{ chat_id: string }>();
  return row?.chat_id ?? null;
}

export async function listPublishers(database: D1Database, chatId: string) {
  const { results } = await database.prepare(
    `SELECT telegram_user_id AS telegramUserId, display_name AS displayName, username, source, status
     FROM library_publishers WHERE chat_id = ?
     ORDER BY status, source DESC, display_name COLLATE NOCASE`,
  ).bind(chatId).all<Publisher>();
  return results;
}

export async function listWithheldAuthors(database: D1Database, chatId: string) {
  const { results } = await database.prepare(
    `SELECT authors.telegram_user_id AS telegramUserId, authors.display_name AS displayName,
       authors.post_count AS postCount, authors.withheld_count AS withheldCount, authors.last_post_at AS lastPostAt
     FROM library_post_authors AS authors
     LEFT JOIN library_publishers AS publishers
       ON publishers.chat_id = authors.chat_id AND publishers.telegram_user_id = authors.telegram_user_id
     WHERE authors.chat_id = ? AND authors.withheld_count > 0 AND publishers.telegram_user_id IS NULL
     ORDER BY authors.last_post_at DESC LIMIT 50`,
  ).bind(chatId).all<WithheldAuthor>();
  return results;
}

export async function listSiteAdminCandidates(database: D1Database) {
  const { results } = await database.prepare(
    `SELECT id, telegram_id AS telegramId, display_name AS displayName, username, role, last_seen_at AS lastSeenAt
     FROM app_users ORDER BY role = 'admin' DESC, last_seen_at DESC LIMIT 40`,
  ).all<SiteAdminCandidate>();
  return results;
}

export async function getSyncOverview(database: D1Database, chatId: string): Promise<SyncOverview> {
  const [run, ready, failures] = await Promise.all([
    database.prepare(
      `SELECT mode, status, started_at AS startedAt, completed_at AS completedAt
       FROM library_sync_runs WHERE chat_id = ? ORDER BY started_at DESC LIMIT 1`,
    ).bind(chatId).first<SyncOverview["lastRun"]>(),
    database.prepare("SELECT COUNT(*) AS count FROM library_materials WHERE chat_id = ? AND sync_state = 'ready'")
      .bind(chatId).first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM library_sync_failures WHERE chat_id = ? AND status = 'pending'")
      .bind(chatId).first<{ count: number }>(),
  ]);
  return { lastRun: run ?? null, readyMaterials: ready?.count ?? 0, pendingFailures: failures?.count ?? 0 };
}

/**
 * Allow or block a Telegram user as a publisher. The sync watcher notices the change (via
 * updated_at) and re-syncs, so their posts appear or disappear within a few minutes.
 */
export async function setPublisherStatus(database: D1Database, input: {
  chatId: string; telegramUserId: string; status: "allowed" | "blocked"; displayName: string; addedBy: string;
}) {
  await database.prepare(
    `INSERT INTO library_publishers (chat_id, telegram_user_id, display_name, source, status, added_by, updated_at)
     VALUES (?, ?, ?, 'manual', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(chat_id, telegram_user_id) DO UPDATE SET status = excluded.status,
       source = CASE WHEN excluded.status = 'blocked' THEN 'manual' ELSE library_publishers.source END,
       display_name = CASE WHEN library_publishers.display_name = '' THEN excluded.display_name ELSE library_publishers.display_name END,
       added_by = excluded.added_by, updated_at = excluded.updated_at`,
  ).bind(input.chatId, input.telegramUserId, input.displayName, input.status, input.addedBy).run();
}

/** Removes a manual entry; Telegram admins are managed in Telegram itself. */
export async function removeManualPublisher(database: D1Database, chatId: string, telegramUserId: string) {
  await database.prepare(
    "DELETE FROM library_publishers WHERE chat_id = ? AND telegram_user_id = ? AND source = 'manual'",
  ).bind(chatId, telegramUserId).run();
}

export async function setSiteAdminRole(database: D1Database, userId: string, role: "member" | "admin") {
  await database.prepare("UPDATE app_users SET role = ? WHERE id = ?").bind(role, userId).run();
}
