-- «Վարք եկեղեցում»-ի կանոններին կցված հղումներ (տեսանյութ, հոդված)։ Ավելացնում է ադմինը («layout» իրավունքով)։
CREATE TABLE IF NOT EXISTS etiquette_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS etiquette_links_topic ON etiquette_links (topic, rule_id);
