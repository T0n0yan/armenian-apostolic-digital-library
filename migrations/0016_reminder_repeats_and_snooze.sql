-- Reminders can repeat every day, week, month or year, and be snoozed (1 or 5 minutes) from the
-- in-app alarm without moving their regular time. SQLite can't change a CHECK in place, so the
-- table is rebuilt with its rows.
CREATE TABLE reading_reminders_next (
  user_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  remind_at TEXT NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  snoozed_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_sent_at TEXT,
  PRIMARY KEY (user_id, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

INSERT INTO reading_reminders_next (user_id, telegram_id, chat_id, message_id, remind_at, repeat, created_at, last_sent_at)
SELECT user_id, telegram_id, chat_id, message_id, remind_at, repeat, created_at, last_sent_at FROM reading_reminders;

DROP TABLE reading_reminders;
ALTER TABLE reading_reminders_next RENAME TO reading_reminders;

CREATE INDEX reading_reminders_due ON reading_reminders (remind_at);
CREATE INDEX reading_reminders_snoozed ON reading_reminders (snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX reading_reminders_user ON reading_reminders (user_id);
