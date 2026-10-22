-- Single verses a reader saved from a psalm's verse popup, shown in «Իմ անկյունը». The verse text,
-- its name ("Սաղմոս 22:3") and address are kept as they were when saved.
CREATE TABLE saved_verses (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  verse INTEGER NOT NULL CHECK (verse > 0 AND verse < 1000),
  verse_text TEXT NOT NULL CHECK (length(verse_text) <= 2000),
  label TEXT NOT NULL CHECK (length(label) <= 200),
  path TEXT NOT NULL CHECK (length(path) <= 200),
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, chat_id, message_id, verse),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_saved_verses_user_date ON saved_verses(user_id, saved_at DESC);
