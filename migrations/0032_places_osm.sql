-- Places brought in from OpenStreetMap (scripts/import-osm-places.py): their OSM element, so a
-- second import adds only new ones, and the Wikidata item when OSM has one.
ALTER TABLE places ADD COLUMN osm_id TEXT;
ALTER TABLE places ADD COLUMN wikidata TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX places_osm_id ON places(osm_id) WHERE osm_id IS NOT NULL;
