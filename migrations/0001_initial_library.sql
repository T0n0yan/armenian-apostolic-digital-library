PRAGMA foreign_keys = ON;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  default_sort TEXT NOT NULL CHECK (
    default_sort IN ('title-asc', 'manual', 'number-asc', 'date-desc')
  ),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  search_title TEXT NOT NULL CHECK (length(trim(search_title)) > 0),
  category_id TEXT NOT NULL,
  telegram_url TEXT NOT NULL CHECK (length(trim(telegram_url)) > 0),
  telegram_url_key TEXT NOT NULL UNIQUE,
  number_value INTEGER CHECK (number_value IS NULL OR number_value > 0),
  date_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (
    visibility IN ('visible', 'hidden')
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX idx_materials_public_listing
  ON materials(category_id, visibility, sort_order, title);

CREATE INDEX idx_materials_number
  ON materials(category_id, number_value);

CREATE INDEX idx_materials_date
  ON materials(category_id, date_value DESC);

CREATE INDEX idx_materials_search_title
  ON materials(search_title);

INSERT INTO categories (id, slug, name, default_sort, sort_order) VALUES
  ('category_saints_lives', 'saints-lives', 'Սրբերի կյանքը', 'title-asc', 10),
  ('category_gospel_teachings', 'gospel-teachings', 'Ավետարանի ուսուցում', 'manual', 20),
  ('category_psalms', 'psalms', 'Սաղմոսներ', 'number-asc', 30),
  ('category_daily_readings', 'daily-readings', 'Օրվա ընթերցումներ', 'date-desc', 40),
  ('category_bible_questions', 'bible-questions', 'Հարցեր Աստվածաշնչից', 'title-asc', 50),
  ('category_prayers', 'prayers', 'Աղոթքներ', 'title-asc', 60),
  ('category_holy_sites_armenia', 'holy-sites-armenia', 'Հայաստանի սրբավայրերը', 'title-asc', 70);
