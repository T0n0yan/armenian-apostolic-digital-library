-- /place's full set of questions: the kind of place (now also «Համալիր», a complex such as the Mother
-- See or Zvartnots), whether it is a working church, the Divine Liturgy, the opening hours. Places
-- keep the same; the kind's CHECK changes, so the table is rebuilt.
ALTER TABLE place_submissions ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN active TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN liturgy TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN open_hours TEXT NOT NULL DEFAULT '';
-- The role a reader picked for the next person serving there (/place's clergy question).
ALTER TABLE bot_place_drafts ADD COLUMN pending TEXT;

CREATE TABLE places_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'church' CHECK (kind IN ('monastery', 'church', 'chapel', 'complex', 'shrine')),
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  osm_id TEXT,
  wikidata TEXT NOT NULL DEFAULT '',
  accessibility TEXT NOT NULL DEFAULT '',
  -- 'yes' (a working church), 'no', 'renovation', or '' (not known).
  active TEXT NOT NULL DEFAULT '',
  liturgy TEXT NOT NULL DEFAULT '',
  open_hours TEXT NOT NULL DEFAULT ''
);
INSERT INTO places_new (id, name, kind, latitude, longitude, region, description, clergy, services, video_url, icon, photos_json,
  credit_name, verified, published, created_at, updated_at, osm_id, wikidata, accessibility)
SELECT id, name, kind, latitude, longitude, region, description, clergy, services, video_url, icon, photos_json,
  credit_name, verified, published, created_at, updated_at, osm_id, wikidata, accessibility FROM places;
DROP TABLE places;
ALTER TABLE places_new RENAME TO places;
CREATE INDEX places_published ON places(published);
CREATE UNIQUE INDEX places_osm_id ON places(osm_id) WHERE osm_id IS NOT NULL;
