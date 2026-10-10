PRAGMA foreign_keys = ON;

CREATE TABLE telegram_sources (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  chat_type TEXT NOT NULL,
  username TEXT,
  last_imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE telegram_topics (
  source_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (source_id, topic_id),
  FOREIGN KEY (source_id) REFERENCES telegram_sources(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE TABLE telegram_imports (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  range_started_at TEXT,
  range_ended_at TEXT,
  total_messages INTEGER NOT NULL,
  added_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL,
  unchanged_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (source_id) REFERENCES telegram_sources(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE
);

ALTER TABLE materials ADD COLUMN telegram_source_id TEXT;
ALTER TABLE materials ADD COLUMN telegram_message_id INTEGER;
ALTER TABLE materials ADD COLUMN telegram_topic_id INTEGER;
ALTER TABLE materials ADD COLUMN published_at TEXT;
ALTER TABLE materials ADD COLUMN edited_at TEXT;
ALTER TABLE materials ADD COLUMN content_kind TEXT;
ALTER TABLE materials ADD COLUMN content_text TEXT NOT NULL DEFAULT '';
ALTER TABLE materials ADD COLUMN search_body TEXT NOT NULL DEFAULT '';
ALTER TABLE materials ADD COLUMN media_types TEXT NOT NULL DEFAULT '[]';
ALTER TABLE materials ADD COLUMN content_hash TEXT;
ALTER TABLE materials ADD COLUMN source_payload TEXT;

CREATE UNIQUE INDEX idx_materials_telegram_identity
  ON materials(telegram_source_id, telegram_message_id)
  WHERE telegram_source_id IS NOT NULL
    AND telegram_message_id IS NOT NULL;

CREATE INDEX idx_materials_published_at
  ON materials(category_id, visibility, published_at DESC);

CREATE INDEX idx_telegram_topics_category
  ON telegram_topics(category_id);

CREATE INDEX idx_telegram_imports_source_date
  ON telegram_imports(source_id, imported_at DESC);
