-- Շարականներ (/church/sharakanner)՝ ըստ տոնի և ժամի, ձայնեղանակով և կատարողով։
-- Ձայնագրությունը՝ church_audio-ում «hymn-<id>» անունով։ hour՝ Ժամերգությունների ուղեցույցի բլոկի id-ն։
CREATE TABLE IF NOT EXISTS hymns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  feast TEXT NOT NULL DEFAULT '',
  hour TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  performer TEXT NOT NULL DEFAULT '',
  grabar TEXT NOT NULL DEFAULT '',
  ashkharhabar TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS hymns_sort ON hymns (sort, id);

-- ՕՐԻՆԱԿ. մեկ տող՝ կառուցվածքը ցույց տալու համար։
INSERT INTO hymns (title, feast, hour, mode, performer, grabar, ashkharhabar, note, status, sort) VALUES
 ('ՕՐԻՆԱԿ — Շարականի անունը', 'ՕՐԻՆԱԿ — Տոնը', 'aravotyan', 'Ա ձայն', 'ՕՐԻՆԱԿ — Երգչախումբ', 'ՕՐԻՆԱԿ. շարականի տեքստը գրաբար', 'ՕՐԻՆԱԿ. նույնը՝ աշխարհաբար', 'ՕՐԻՆԱԿ. ով է գրել, երբ է երգվում', 'review', 10);

UPDATE guides SET status = 'review' WHERE slug = 'hymns' AND status = 'draft';
