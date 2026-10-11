PRAGMA foreign_keys = ON;

CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE saved_materials (
  user_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE
);

CREATE INDEX idx_saved_materials_user_date
  ON saved_materials(user_id, saved_at DESC);
