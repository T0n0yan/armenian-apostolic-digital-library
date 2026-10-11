PRAGMA foreign_keys = ON;

ALTER TABLE app_users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'admin'));

CREATE INDEX idx_app_users_role
  ON app_users(role, last_seen_at DESC);
