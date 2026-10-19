-- When each verse of a psalm's recording begins (seconds), marked by an editor in the library's
-- marking mode, so the text follows the audio exactly. One row per psalm post.
CREATE TABLE psalm_timings (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  starts_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id)
);
