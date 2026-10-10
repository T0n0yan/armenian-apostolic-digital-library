PRAGMA foreign_keys = ON;

-- Saints follow Telegram's own message sequence. New JSON imports therefore
-- continue the order without adding saint names to application code.
UPDATE categories
SET default_sort = 'manual',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'category_saints_lives';

UPDATE materials
SET sort_order = telegram_message_id,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE category_id = 'category_saints_lives'
  AND telegram_message_id IS NOT NULL;

UPDATE categories
SET default_sort = 'date-desc',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN ('category_prayers', 'category_bible_questions');

-- Keep the section and any future data intact, but remove it from the MVP UI.
UPDATE categories
SET is_active = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'category_holy_sites_armenia';
