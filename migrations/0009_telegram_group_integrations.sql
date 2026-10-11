PRAGMA foreign_keys = ON;

CREATE TABLE telegram_bot_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE telegram_group_integrations (
  chat_id TEXT PRIMARY KEY,
  chat_title TEXT NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('group', 'supergroup')),
  launch_message_id INTEGER NOT NULL,
  connected_by_user_id TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (connected_by_user_id) REFERENCES app_users(id)
);

CREATE INDEX idx_telegram_group_integrations_updated
  ON telegram_group_integrations(updated_at DESC);
