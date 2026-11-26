-- Սրբավայրի 3D մոդելը (անձնագիր, JSON)։ Ադմինները խմբագրում են սևագիրը, հրապարակում է միայն տերը։
CREATE TABLE church_models (
  place_id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  published_json TEXT,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at TEXT
);

-- Նախորդ տարբերակները (վերջին 20-ը ամեն սրբավայրի համար)՝ սխալի դեպքում հետ վերադառնալու համար։
CREATE TABLE church_model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL,
  model_json TEXT NOT NULL,
  saved_by TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX church_model_versions_place ON church_model_versions (place_id, id DESC);
