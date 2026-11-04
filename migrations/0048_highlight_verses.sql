-- Սաղմոսի համարը նշման մեջ (համարի պատուհանից պահվածների համար)։ «Պահված համարները»
-- տեղափոխվում են նշումների մեջ. saved_verses աղյուսակը մնում է որպես պահուստ, այլևս չի գրվում։
ALTER TABLE highlights ADD COLUMN verse INTEGER CHECK (verse IS NULL OR (verse > 0 AND verse < 1000));

INSERT INTO highlights (id, user_id, chat_id, message_id, kind, quote, section, title, path, verse, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  sv.user_id, sv.chat_id, sv.message_id, 'mark',
  substr(trim(sv.verse_text), 1, 1200),
  COALESCE((SELECT topics.title FROM library_materials AS m JOIN library_topics AS topics ON topics.id = m.topic_key
            WHERE m.chat_id = sv.chat_id AND m.message_id = sv.message_id), 'Սաղմոսներ'),
  sv.label,
  CASE WHEN sv.path LIKE '%/' || sv.verse THEN substr(sv.path, 1, length(sv.path) - length(CAST(sv.verse AS TEXT)) - 1) ELSE sv.path END,
  sv.verse, sv.saved_at, sv.saved_at
FROM saved_verses AS sv
WHERE length(trim(sv.verse_text)) > 0
  AND NOT EXISTS (SELECT 1 FROM highlights AS h WHERE h.user_id = sv.user_id AND h.chat_id = sv.chat_id AND h.message_id = sv.message_id AND h.verse = sv.verse);

CREATE INDEX idx_highlights_verse ON highlights(user_id, chat_id, message_id, verse);
