-- A reader sending a sacred place to the bot (/place): while a draft is open, their photos,
-- location and notes go to the support group's «Սրբավայրեր» topic under one header message.
CREATE TABLE bot_place_drafts (
  telegram_id INTEGER PRIMARY KEY,
  header_message_id INTEGER,
  finished INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
