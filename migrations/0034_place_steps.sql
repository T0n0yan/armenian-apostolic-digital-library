-- /place asks step by step (name → location → photos → notes): the step a reader is on, the name
-- they gave, and when the team handled the submission (its sender's details are removed later).
ALTER TABLE bot_place_drafts ADD COLUMN step TEXT NOT NULL DEFAULT 'name';
ALTER TABLE place_submissions ADD COLUMN place_name TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN handled_at TEXT;
