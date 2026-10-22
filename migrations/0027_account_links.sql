-- A Google account a reader joined to their Telegram account: signing in with that Google account
-- afterwards opens the Telegram account, so both ways reach the same saved items and reminders.
CREATE TABLE account_links (
  alias_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
