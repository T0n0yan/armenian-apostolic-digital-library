PRAGMA foreign_keys = OFF;

-- Telegram remains the source of truth. Existing bookmarks are reduced to
-- Telegram references before the legacy content mirror is removed.
ALTER TABLE saved_materials RENAME TO saved_materials_legacy;

CREATE TABLE saved_materials (
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  personal_note TEXT NOT NULL DEFAULT '' CHECK (length(personal_note) <= 160),
  personal_note_search TEXT NOT NULL DEFAULT '' CHECK (length(personal_note_search) <= 200),
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, chat_id, message_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

INSERT OR IGNORE INTO saved_materials (
  user_id, chat_id, message_id, personal_note, personal_note_search, saved_at
)
SELECT
  saved.user_id,
  sources.chat_id,
  materials.telegram_message_id,
  saved.personal_note,
  saved.personal_note_search,
  saved.saved_at
FROM saved_materials_legacy AS saved
INNER JOIN materials ON materials.id = saved.material_id
INNER JOIN telegram_sources AS sources ON sources.id = materials.telegram_source_id
WHERE materials.telegram_message_id IS NOT NULL;

DROP TABLE saved_materials_legacy;

CREATE INDEX idx_saved_materials_user_date
  ON saved_materials(user_id, saved_at DESC);
CREATE INDEX idx_saved_materials_user_note
  ON saved_materials(user_id, personal_note_search);

-- Stable mappings are application state, not mirrored Telegram content.
CREATE TABLE telegram_hashtag_mappings (
  hashtag TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE telegram_post_category_mappings (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE telegram_review_items (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  forum_topic_id INTEGER,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'ignored')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  PRIMARY KEY (chat_id, message_id)
);

DROP TABLE IF EXISTS telegram_imports;
DROP TABLE IF EXISTS telegram_group_integrations;
DROP TABLE IF EXISTS telegram_bot_updates;
DROP TABLE IF EXISTS materials;

UPDATE categories SET is_active = 0
WHERE id NOT IN (
  'category_saints_lives',
  'category_gospel_teachings',
  'category_psalms',
  'category_daily_readings',
  'category_bible_questions',
  'category_prayers'
);

PRAGMA foreign_keys = ON;
