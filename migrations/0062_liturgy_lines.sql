-- Պատարագամատույց (/church/patarag)։ Տեքստը մուտքագրում է տերը ադմինում (/admin/patarag)։
-- start՝ տողի սկիզբը ձայնագրության մեջ (վայրկյան), նշում է խմբագիրը։
CREATE TABLE IF NOT EXISTS liturgy_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort INTEGER NOT NULL DEFAULT 0,
  part TEXT NOT NULL DEFAULT '',
  speaker TEXT NOT NULL DEFAULT 'priest' CHECK (speaker IN ('priest', 'deacon', 'people', 'choir', 'all')),
  grabar TEXT NOT NULL DEFAULT '',
  ashkharhabar TEXT NOT NULL DEFAULT '',
  rubric TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  start REAL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS liturgy_lines_sort ON liturgy_lines (sort, id);

-- Ձայնագրություններ (Պատարագ և շարականներ)՝ R2 church/ թղթապանակում։
CREATE TABLE IF NOT EXISTS church_audio (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  duration REAL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ՕՐԻՆԱԿ. 4 տող՝ միայն կառուցվածքը ցույց տալու համար (տերը կփոխարինի իսկական տեքստով)։
INSERT INTO liturgy_lines (sort, part, speaker, grabar, ashkharhabar, rubric, note) VALUES
 (10, 'ՕՐԻՆԱԿ — Մասի անունը', 'deacon', 'ՕՐԻՆԱԿ. սարկավագի խոսքը գրաբար', 'ՕՐԻՆԱԿ. նույնը՝ աշխարհաբար', 'ՕՐԻՆԱԿ. ցուցում՝ ինչ է կատարվում այս պահին', 'ՕՐԻՆԱԿ. կարճ բացատրություն'),
 (20, 'ՕՐԻՆԱԿ — Մասի անունը', 'priest', 'ՕՐԻՆԱԿ. քահանայի խոսքը գրաբար', 'ՕՐԻՆԱԿ. նույնը՝ աշխարհաբար', '', ''),
 (30, 'ՕՐԻՆԱԿ — Մասի անունը', 'people', 'Ամէն։', 'Ամեն։', '', 'ՕՐԻՆԱԿ. ժողովրդի պատասխանն ընդգծված է'),
 (40, 'ՕՐԻՆԱԿ — Երկրորդ մաս', 'choir', 'ՕՐԻՆԱԿ. երգչախմբի երգը գրաբար', 'ՕՐԻՆԱԿ. նույնը՝ աշխարհաբար', 'ՕՐԻՆԱԿ. բոլորը կանգնում են', '');

UPDATE guides SET status = 'review' WHERE slug = 'patarag' AND status = 'draft';
