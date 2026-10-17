PRAGMA foreign_keys = ON;

-- Who may publish into the public library. Telegram group admins are mirrored here on every sync
-- (source 'telegram_admin'); the admin page adds or blocks anyone else (source 'manual').
-- A 'blocked' row overrides admin status.
CREATE TABLE library_publishers (
  chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  source TEXT NOT NULL CHECK (source IN ('telegram_admin', 'manual')),
  status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'blocked')),
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, telegram_user_id)
);

CREATE INDEX idx_library_publishers_status
  ON library_publishers(chat_id, status);

-- Everyone who has posted in the content forum, so the admin page can offer to allow them.
CREATE TABLE library_post_authors (
  chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  withheld_count INTEGER NOT NULL DEFAULT 0 CHECK (withheld_count >= 0),
  last_post_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, telegram_user_id)
);

ALTER TABLE library_materials ADD COLUMN author_id TEXT;

CREATE INDEX idx_library_materials_author
  ON library_materials(chat_id, author_id);

-- Sacred places map (churches, monasteries, chapels...). Places are curated; Telegram posts with a
-- location become submissions that an admin matches to an existing place or turns into a new one.
-- Telegram strips EXIF from photos, so coordinates come from an attached location/venue, never
-- from the image itself.
CREATE TABLE sacred_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_latin TEXT,
  kind TEXT NOT NULL CHECK (kind IN (
    'church', 'cathedral', 'monastery', 'chapel', 'shrine', 'khachkar', 'spring', 'other'
  )),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  region TEXT,
  settlement TEXT,
  diocese TEXT,
  founded_text TEXT,
  description TEXT,
  material_chat_id TEXT,
  material_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'admin', 'import')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (material_chat_id, material_message_id) REFERENCES library_materials(chat_id, message_id)
    ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX idx_sacred_places_map
  ON sacred_places(status, latitude, longitude);
CREATE INDEX idx_sacred_places_kind
  ON sacred_places(status, kind, region);

CREATE TABLE sacred_place_submissions (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  author_id TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  venue_title TEXT,
  address TEXT,
  caption TEXT NOT NULL DEFAULT '',
  matched_place_id TEXT REFERENCES sacred_places(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'matched', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id)
);

CREATE INDEX idx_sacred_place_submissions_review
  ON sacred_place_submissions(status, created_at DESC);

CREATE TABLE sacred_place_photos (
  place_id TEXT NOT NULL REFERENCES sacred_places(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  media_index INTEGER NOT NULL CHECK (media_index >= 0),
  author_id TEXT,
  caption TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (place_id, chat_id, message_id, media_index)
);

CREATE INDEX idx_sacred_place_photos_place
  ON sacred_place_photos(place_id, status, is_cover DESC, created_at DESC);
