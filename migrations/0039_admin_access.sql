-- Admin levels. The owner (գլխավոր ադմին) may do everything and is the only one who opens /admin;
-- other admins may do only what the owner ticked for them (permissions: a JSON list of names).
CREATE TABLE admin_access (
  user_id TEXT PRIMARY KEY,
  owner INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
-- The first admin (the site's owner) becomes the owner; any other admin keeps no rights until given some.
INSERT INTO admin_access (user_id, owner)
  SELECT id, 1 FROM app_users WHERE role = 'admin' ORDER BY created_at LIMIT 1;
