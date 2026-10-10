PRAGMA foreign_keys = ON;

ALTER TABLE materials ADD COLUMN content_fingerprint TEXT;

-- The first daily-readings topic message explains the section; it is not a
-- dated reading. Real daily readings in the Telegram export begin with a date.
UPDATE materials
SET date_value = NULL
WHERE category_id = 'category_daily_readings'
  AND date_value IS NOT NULL
  AND substr(ltrim(content_text), 1, 1) NOT GLOB '[0-9]';

CREATE UNIQUE INDEX idx_materials_unique_psalm_number
  ON materials(category_id, number_value)
  WHERE category_id = 'category_psalms'
    AND number_value IS NOT NULL;

CREATE UNIQUE INDEX idx_materials_unique_daily_date
  ON materials(category_id, date_value)
  WHERE category_id = 'category_daily_readings'
    AND date_value IS NOT NULL;

CREATE UNIQUE INDEX idx_materials_unique_named_category_title
  ON materials(category_id, search_title)
  WHERE category_id IN (
    'category_saints_lives',
    'category_gospel_teachings',
    'category_bible_questions',
    'category_holy_sites_armenia'
  );

CREATE UNIQUE INDEX idx_materials_unique_prayer_content
  ON materials(category_id, content_fingerprint)
  WHERE category_id = 'category_prayers'
    AND content_fingerprint IS NOT NULL;
