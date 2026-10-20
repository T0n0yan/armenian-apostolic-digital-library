-- Who is on the site: one row per device (a random id kept in the browser), refreshed every few
-- minutes while a page is open. Feeds the admin page: devices and who is online now.
CREATE TABLE site_presence (
  visitor_id TEXT PRIMARY KEY CHECK (length(visitor_id) BETWEEN 8 AND 64),
  user_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'windows', 'macos', 'linux', 'other')),
  in_telegram INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_site_presence_last_seen ON site_presence(last_seen);

-- Small site-wide values; "cache_epoch" changes when an admin asks to refresh the site now.
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
