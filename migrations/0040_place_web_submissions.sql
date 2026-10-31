-- Places sent from the site's form (readers signed in with Google or Telegram), next to the bot's.
-- Their photos are in R2 under submissions/<id>/ (photos_json holds "r2:<key>"), not on Telegram.
ALTER TABLE place_submissions ADD COLUMN source TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE place_submissions ADD COLUMN user_id TEXT;
