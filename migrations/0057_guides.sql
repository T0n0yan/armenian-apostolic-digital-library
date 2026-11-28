-- «Ուղեցույցներ» համակարգ («Կարգեր և վարքեր»). խմբագրում է `guides` իրավունքով ադմինը (/admin/guides)։
-- status՝ draft (միայն ադմինը), review (Ստուգման մեջ), published (քահանան ստուգել է)։
CREATE TABLE IF NOT EXISTS guides (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'guide' CHECK (kind IN ('guide', 'link')),
  link TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '{"blocks":[],"faq":[]}',
  sources_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  verified_by TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS guides_sort ON guides (sort);
