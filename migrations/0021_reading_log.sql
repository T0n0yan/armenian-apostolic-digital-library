-- Days a reader actually read: a material page kept open a minute, a recording listened to the
-- end, or a quiz answered. One row per reader, day and material; the day is the reader's local date.
CREATE TABLE reading_log (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL CHECK (length(day) = 10),
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  kind TEXT NOT NULL DEFAULT 'read' CHECK (kind IN ('read', 'listen', 'quiz')),
  logged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
