ALTER TABLE saved_materials
  ADD COLUMN personal_note TEXT NOT NULL DEFAULT ''
  CHECK (length(personal_note) <= 160);

ALTER TABLE saved_materials
  ADD COLUMN personal_note_search TEXT NOT NULL DEFAULT ''
  CHECK (length(personal_note_search) <= 200);

CREATE INDEX idx_saved_materials_user_note
  ON saved_materials(user_id, personal_note_search);
