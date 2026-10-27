-- Words that mark a church of another denomination («Բեթել», «Ավետարանական»…). A place whose name has
-- one never shows on the public map, and the admin sees it flagged. The admin edits the list.
CREATE TABLE place_blocklist (
  word TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Not «Կաթողիկե» alone: Apostolic cathedrals carry that word too (Երևանի Կաթողիկե).
INSERT INTO place_blocklist (word) VALUES
  ('բեթել'), ('էմմանուել'), ('ավետարանական'), ('կաթոլիկ'), ('հայ կաթողիկե'), ('կյանքի խոսք'), ('աղոթատուն'),
  ('ժողովարան'), ('եհովա'), ('բապտիստ'), ('մեթոդիստ'), ('հոգեգալստական'), ('ադվենտիստ'), ('մորմոն'),
  ('նոր կյանք'), ('մոլոկան'), ('պենտեկոստ'), ('սալեզյան');

-- OpenStreetMap places the admin deleted, so a later import doesn't bring them back.
CREATE TABLE place_rejected (
  osm_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
