-- Cloud-backed public library. Telegram remains the editorial source, while
-- public requests read material metadata from D1 and media bytes from R2.
-- This migration is deliberately additive: user, bookmark, mapping and
-- analytics tables are not modified.

CREATE TABLE library_sources (
  chat_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  username TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('group', 'supergroup', 'channel')),
  is_forum INTEGER NOT NULL DEFAULT 0 CHECK (is_forum IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE library_topics (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL CHECK (topic_id > 0),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  default_sort TEXT NOT NULL DEFAULT 'date-desc'
    CHECK (default_sort IN ('title-asc', 'manual', 'number-asc', 'date-desc')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'hidden')),
  icon_color INTEGER,
  icon_emoji_id TEXT,
  is_general INTEGER NOT NULL DEFAULT 0 CHECK (is_general IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  telegram_message_count INTEGER,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (chat_id, topic_id),
  FOREIGN KEY (chat_id) REFERENCES library_sources(chat_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_library_topics_navigation
  ON library_topics(chat_id, status, is_general, display_order, topic_id);

CREATE TABLE library_materials (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  material_id TEXT NOT NULL UNIQUE,
  topic_key TEXT NOT NULL,
  topic_id INTEGER NOT NULL CHECK (topic_id > 0),
  media_group_id TEXT,
  constituent_message_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(constituent_message_ids_json)),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'text', 'photo', 'album', 'video', 'voice', 'audio', 'poll',
    'location', 'document', 'animation', 'unsupported'
  )),
  title TEXT NOT NULL,
  telegram_url TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  caption_text TEXT NOT NULL DEFAULT '',
  formatted_text_json TEXT NOT NULL DEFAULT '{"text":"","entities":[]}' CHECK (json_valid(formatted_text_json)),
  formatted_caption_json TEXT NOT NULL DEFAULT '{"text":"","entities":[]}' CHECK (json_valid(formatted_caption_json)),
  rich_content_json TEXT CHECK (rich_content_json IS NULL OR json_valid(rich_content_json)),
  poll_json TEXT CHECK (poll_json IS NULL OR json_valid(poll_json)),
  location_json TEXT CHECK (location_json IS NULL OR json_valid(location_json)),
  unsupported_type TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  number_value INTEGER,
  date_value TEXT,
  published_at TEXT,
  edited_at TEXT,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  source_revision TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_state IN ('pending', 'pending_media', 'ready', 'failed', 'deleted')),
  deleted_at TEXT,
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id),
  FOREIGN KEY (topic_key) REFERENCES library_topics(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_library_materials_topic_feed
  ON library_materials(topic_key, sync_state, published_at DESC, message_id DESC);
CREATE INDEX idx_library_materials_public_date
  ON library_materials(sync_state, published_at DESC, message_id DESC);
CREATE INDEX idx_library_materials_content_hash
  ON library_materials(content_hash);
CREATE INDEX idx_library_materials_media_group
  ON library_materials(chat_id, media_group_id);

CREATE TABLE library_material_blocks (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  block_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  block_type TEXT NOT NULL,
  plain_text TEXT NOT NULL DEFAULT '',
  structured_json TEXT NOT NULL CHECK (json_valid(structured_json)),
  PRIMARY KEY (chat_id, message_id, block_id),
  FOREIGN KEY (chat_id, message_id) REFERENCES library_materials(chat_id, message_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_library_material_blocks_order
  ON library_material_blocks(chat_id, message_id, ordinal);

CREATE TABLE library_media (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  media_index INTEGER NOT NULL CHECK (media_index >= 0),
  source_message_id INTEGER NOT NULL CHECK (source_message_id > 0),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'audio', 'voice', 'animation', 'document')),
  mime_type TEXT,
  file_name TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration INTEGER CHECK (duration IS NULL OR duration >= 0),
  title TEXT,
  performer TEXT,
  waveform TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  r2_key TEXT UNIQUE,
  thumbnail_r2_key TEXT UNIQUE,
  sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  r2_etag TEXT,
  thumbnail_etag TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'ready', 'failed', 'missing')),
  failure_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  uploaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id, media_index),
  FOREIGN KEY (chat_id, message_id) REFERENCES library_materials(chat_id, message_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_library_media_status
  ON library_media(status, last_attempt_at);

CREATE TABLE library_album_members (
  chat_id TEXT NOT NULL,
  canonical_message_id INTEGER NOT NULL,
  member_message_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (chat_id, canonical_message_id, member_message_id),
  UNIQUE (chat_id, canonical_message_id, ordinal),
  FOREIGN KEY (chat_id, canonical_message_id) REFERENCES library_materials(chat_id, message_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE library_search_documents (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  field_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  field_kind TEXT NOT NULL,
  block_id TEXT,
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  aliases_text TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (chat_id, message_id, field_id),
  FOREIGN KEY (chat_id, message_id) REFERENCES library_materials(chat_id, message_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_library_search_documents_material
  ON library_search_documents(chat_id, message_id, ordinal);

CREATE VIRTUAL TABLE library_search_fts USING fts5(
  chat_id UNINDEXED,
  message_id UNINDEXED,
  field_id UNINDEXED,
  normalized_text,
  aliases_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE library_sync_cursors (
  chat_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL CHECK (topic_id > 0),
  phase TEXT NOT NULL CHECK (phase IN ('history', 'media', 'reconcile', 'complete')),
  cursor TEXT,
  last_message_id INTEGER,
  last_source_revision TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chat_id, topic_id),
  FOREIGN KEY (chat_id) REFERENCES library_sources(chat_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE library_sync_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'historical', 'incremental', 'reconcile')),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'cancelled')),
  topics_seen INTEGER NOT NULL DEFAULT 0,
  materials_seen INTEGER NOT NULL DEFAULT 0,
  materials_written INTEGER NOT NULL DEFAULT 0,
  media_seen INTEGER NOT NULL DEFAULT 0,
  media_uploaded INTEGER NOT NULL DEFAULT 0,
  media_skipped INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (chat_id) REFERENCES library_sources(chat_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_library_sync_runs_source_date
  ON library_sync_runs(chat_id, started_at DESC);

CREATE TABLE library_sync_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER,
  media_index INTEGER,
  stage TEXT NOT NULL,
  error_code TEXT NOT NULL,
  retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (run_id, chat_id, message_id, media_index, stage),
  FOREIGN KEY (run_id) REFERENCES library_sync_runs(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_library_sync_failures_review
  ON library_sync_failures(status, retryable, created_at);
