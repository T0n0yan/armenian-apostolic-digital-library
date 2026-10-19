-- Saves copied over in 0010 kept the old positive chat id ("2993860753") while the cloud library
-- stores supergroups as "-100…", so they showed as "no longer available". Move each one to the
-- library's chat id when that post exists, keeping a newer save of the same post if there is one.
INSERT OR IGNORE INTO saved_materials (user_id, chat_id, message_id, personal_note, personal_note_search, saved_at)
SELECT saved.user_id, '-100' || saved.chat_id, saved.message_id, saved.personal_note, saved.personal_note_search, saved.saved_at
FROM saved_materials AS saved
WHERE saved.chat_id NOT LIKE '-%'
  AND EXISTS (
    SELECT 1 FROM library_materials AS materials
    WHERE materials.chat_id = '-100' || saved.chat_id AND materials.message_id = saved.message_id
  );

DELETE FROM saved_materials
WHERE chat_id NOT LIKE '-%'
  AND EXISTS (
    SELECT 1 FROM saved_materials AS moved
    WHERE moved.user_id = saved_materials.user_id
      AND moved.chat_id = '-100' || saved_materials.chat_id
      AND moved.message_id = saved_materials.message_id
  );
