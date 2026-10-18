-- Browser push subscriptions (Web Push), so reminders reach readers who use the site outside
-- Telegram even when it is closed. One row per browser; a reader may have several.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);
