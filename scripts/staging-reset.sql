-- Staging only (.github/workflows/staging-reset.yml): trims the library to two materials per
-- section and empties the places map, so the owner can try things on a small, clean site.
-- Materials are taken down the way the sync does it (sync_state 'deleted'); a hand-started
-- staging sync brings them back. Never run on production.

-- Each section keeps its introduction (the oldest post of the sections that show one) and two
-- materials: the first two psalms by number, the newest two elsewhere.
DROP TABLE IF EXISTS staging_keep;
CREATE TABLE staging_keep AS
WITH live AS (
  SELECT m.chat_id, m.message_id, m.topic_key, m.number_value,
    instr(t.title, 'աղմոս') > 0 AS psalms,
    (instr(t.title, 'աղմոս') > 0 OR instr(t.title, 'ղոթ') > 0 OR instr(t.title, 'րբ') > 0
      OR instr(t.title, 'արք') > 0 OR instr(t.title, 'արց') > 0) AS intro_topic,
    m.message_id = (SELECT MIN(f.message_id) FROM library_materials f
      WHERE f.topic_key = m.topic_key AND f.sync_state = 'ready' AND f.deleted_at IS NULL) AS oldest
  FROM library_materials m JOIN library_topics t ON t.id = m.topic_key
  WHERE m.sync_state = 'ready' AND m.deleted_at IS NULL
),
ranked AS (
  SELECT chat_id, message_id, ROW_NUMBER() OVER (PARTITION BY topic_key ORDER BY
    CASE WHEN psalms THEN number_value IS NULL END,
    CASE WHEN psalms THEN number_value END,
    message_id DESC) AS position
  FROM live WHERE NOT (intro_topic AND oldest)
)
SELECT chat_id, message_id FROM live WHERE intro_topic AND oldest
UNION SELECT chat_id, message_id FROM ranked WHERE position <= 2;

UPDATE library_materials
SET sync_state = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE sync_state <> 'deleted'
  AND NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = library_materials.chat_id AND k.message_id = library_materials.message_id);

DELETE FROM library_search_fts WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = library_search_fts.chat_id AND k.message_id = library_search_fts.message_id);
DELETE FROM library_search_documents WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = library_search_documents.chat_id AND k.message_id = library_search_documents.message_id);

-- Readers' marks on materials that are gone.
DELETE FROM saved_materials WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = saved_materials.chat_id AND k.message_id = saved_materials.message_id);
DELETE FROM reading_reminders WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = reading_reminders.chat_id AND k.message_id = reading_reminders.message_id);
DELETE FROM saved_verses WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = saved_verses.chat_id AND k.message_id = saved_verses.message_id);
DELETE FROM poll_votes WHERE NOT EXISTS (SELECT 1 FROM staging_keep k WHERE k.chat_id = poll_votes.chat_id AND k.message_id = poll_votes.message_id);
DROP TABLE staging_keep;

-- The places map starts empty: no places, submissions, drafts or visits.
DELETE FROM place_visits;
DELETE FROM place_submissions;
DELETE FROM bot_place_drafts;
DELETE FROM places;

-- Every cached page is rebuilt on its next visit.
INSERT INTO site_settings (key, value) VALUES ('cache_epoch', CAST(CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS TEXT))
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
