-- The library's content version is MAX(updated_at) (app/data/content-version.server.ts): with
-- this index it reads one row instead of every material.
CREATE INDEX IF NOT EXISTS idx_library_materials_updated_at ON library_materials (updated_at);
