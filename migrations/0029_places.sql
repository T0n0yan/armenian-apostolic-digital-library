-- Sacred places for the map (/places): what readers send through /place, and the places the team
-- publishes from them.

-- One /place conversation as the team sees it in /admin: the sender, the location, the notes and
-- the Telegram files, until it is turned into a place or set aside.
CREATE TABLE place_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  credit INTEGER,
  latitude REAL,
  longitude REAL,
  notes TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  videos_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'used', 'dismissed')),
  place_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX place_submissions_status ON place_submissions(status, created_at);

ALTER TABLE bot_place_drafts ADD COLUMN submission_id INTEGER;

-- A place on the map. Pictures live in R2 under places/<id>/; `icon` is the church's drawing
-- (transparent PNG) shown on the map, `photos_json` its photos in order (the first is the cover).
-- `verified` stays 0 («⚑ Ճշտել») until clergy have checked the text.
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'church' CHECK (kind IN ('monastery', 'church', 'chapel', 'shrine')),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  clergy TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  icon TEXT,
  photos_json TEXT NOT NULL DEFAULT '[]',
  credit_name TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX places_published ON places(published);
