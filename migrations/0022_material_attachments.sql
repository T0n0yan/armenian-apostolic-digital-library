-- Recordings added to a post on the site itself, for posts Telegram can't carry them on
-- (a text longer than an audio caption's 1024 characters). The sync never touches this table.
CREATE TABLE material_attachments (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  media_index INTEGER NOT NULL CHECK (media_index >= 100),
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'video', 'photo', 'document')),
  mime_type TEXT,
  file_name TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration INTEGER CHECK (duration IS NULL OR duration >= 0),
  title TEXT,
  performer TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  r2_etag TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id, media_index)
);
