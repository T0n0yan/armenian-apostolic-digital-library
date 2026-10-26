-- /place: the region and village found from the location (or asked), and the reader's own words for
-- the kind of place when no button fits («Հեթանոսական տաճար»).
ALTER TABLE place_submissions ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE place_submissions ADD COLUMN kind_note TEXT NOT NULL DEFAULT '';
