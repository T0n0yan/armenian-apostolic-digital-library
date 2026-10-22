/** Tables whose rows belong to one reader (user_id); a joined Google account's rows move over. */
const USER_TABLES = ["saved_materials", "saved_verses", "reading_reminders", "reminder_inbox", "reading_log", "poll_votes", "push_subscriptions"];

/**
 * Joins a Google account to the reader's Telegram account: its saved items, notes, reminders and
 * reading log move to the Telegram account (where both have the same item, the Telegram one stays),
 * and later Google sign-ins open the Telegram account.
 */
export async function joinAccounts(database: D1Database, aliasId: string, user: { id: string; telegramId: string }) {
  if (aliasId === user.id) return;
  for (const table of USER_TABLES) {
    // A table may be missing in an environment that has not got it yet; the others still move.
    await database.batch([
      database.prepare(`UPDATE OR IGNORE ${table} SET user_id = ? WHERE user_id = ?`).bind(user.id, aliasId),
      database.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(aliasId),
    ]).catch((error) => console.error(JSON.stringify({ event: "account_join_table_failed", table, error: String(error) })));
  }
  // Reminders reach the reader through the bot by their Telegram id.
  await database.prepare("UPDATE reading_reminders SET telegram_id = ? WHERE user_id = ?").bind(user.telegramId, user.id).run().catch(() => undefined);
  await database.prepare(
    "INSERT INTO account_links (alias_id, user_id) VALUES (?, ?) ON CONFLICT(alias_id) DO UPDATE SET user_id = excluded.user_id, linked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ).bind(aliasId, user.id).run();
}

/** The Telegram account a Google account was joined to, or null. */
export async function linkedAccount(database: D1Database, aliasId: string) {
  return database.prepare(
    `SELECT users.id, users.telegram_id, users.display_name, users.username FROM account_links AS links
     INNER JOIN app_users AS users ON users.id = links.user_id WHERE links.alias_id = ?`,
  ).bind(aliasId).first<{ id: string; telegram_id: string; display_name: string; username: string | null }>().catch(() => null);
}
