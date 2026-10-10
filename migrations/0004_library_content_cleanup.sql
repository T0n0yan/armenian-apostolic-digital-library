PRAGMA foreign_keys = ON;

UPDATE categories
SET default_sort = 'manual',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'category_saints_lives';

-- Topic introductions remain preserved in the admin index, but they are not
-- library materials and therefore must not be shown publicly.
UPDATE materials
SET visibility = 'hidden',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (category_id = 'category_saints_lives' AND telegram_message_id = 137)
   OR (category_id = 'category_psalms' AND telegram_message_id = 84);

UPDATE materials
SET title = 'ՍՈՒՐԲ ԱԲԵԼ ԱՐԴԱՐ',
    search_title = 'սուրբ աբել արդար',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE category_id = 'category_saints_lives'
  AND telegram_message_id = 168;

UPDATE materials
SET sort_order = CASE telegram_message_id
      WHEN 143 THEN 10
      WHEN 157 THEN 20
      WHEN 168 THEN 30
      WHEN 318 THEN 40
      ELSE 10000 + COALESCE(telegram_message_id, 0)
    END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE category_id = 'category_saints_lives';
