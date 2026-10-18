-- Reading reminders: a reader asks to be reminded to read a material at a chosen time (once, or
-- every day/week). Cloudflare's per-minute cron sends due reminders as a Telegram bot message.
CREATE TABLE reading_reminders (
  user_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  remind_at TEXT NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_sent_at TEXT,
  PRIMARY KEY (user_id, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX reading_reminders_due ON reading_reminders (remind_at);

-- Readers who were already sent the bell sound (sent once, with how to set it for notifications).
CREATE TABLE reminder_sound_sent (
  telegram_id TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
