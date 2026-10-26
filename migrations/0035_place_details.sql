-- /place asks each detail on its own (who serves, services, access) and sends nothing to the team
-- until the reader reviews it and presses «Ուղարկել» (submitted_at). `mode` marks a field being
-- changed from that review. Places keep the access note too.
ALTER TABLE place_submissions ADD COLUMN clergy TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN services TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN accessibility TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN credit_name TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN submitted_at TEXT;
UPDATE place_submissions SET submitted_at = created_at, credit_name = CASE WHEN credit = 1 THEN sender_name ELSE '' END WHERE credit IS NOT NULL;
ALTER TABLE bot_place_drafts ADD COLUMN mode TEXT;
ALTER TABLE places ADD COLUMN accessibility TEXT NOT NULL DEFAULT '';
