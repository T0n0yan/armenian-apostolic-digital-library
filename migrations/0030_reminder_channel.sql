-- How a reminder rings: "push" (the site's notification and the bot, sent by the server) or
-- "calendar" (an event the reader added to the phone's own calendar; the server sends nothing).
ALTER TABLE reading_reminders ADD COLUMN channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'calendar'));
