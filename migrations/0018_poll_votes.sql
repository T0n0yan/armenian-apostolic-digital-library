-- Votes cast in the library on Telegram polls and quizzes (Telegram accounts and Google accounts
-- alike). They are shown together with the poll's Telegram results; one vote per reader.
CREATE TABLE poll_votes (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  option_index INTEGER NOT NULL CHECK (option_index >= 0 AND option_index < 12),
  voted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX poll_votes_poll ON poll_votes (chat_id, message_id);
