-- Reminders that have rung but the reader hasn't marked as read yet ("Կարդացել եմ"), shown in
-- the bell's list until then.
CREATE TABLE reminder_inbox (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  rang_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
