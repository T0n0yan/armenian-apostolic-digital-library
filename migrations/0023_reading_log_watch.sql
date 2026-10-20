-- Readers now mark materials themselves: read, listened or watched (plus quizzes answered).
CREATE TABLE reading_log_next (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL CHECK (length(day) = 10),
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  kind TEXT NOT NULL DEFAULT 'read' CHECK (kind IN ('read', 'listen', 'watch', 'quiz')),
  logged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
INSERT INTO reading_log_next (user_id, day, chat_id, message_id, kind, logged_at)
  SELECT user_id, day, chat_id, message_id, kind, logged_at FROM reading_log;
DROP TABLE reading_log;
ALTER TABLE reading_log_next RENAME TO reading_log;
