-- Բրաուզերի սխալները (window.onerror, unhandledrejection). անանուն, առանց օգտվողի կամ IP-ի։
-- Նույն սխալը (fingerprint) մեկ տող է՝ քանակով, որ աղյուսակը չմեծանա։ 30 օրից հինը ջնջվում է
-- գիշերային մաքրումով (retention.server.ts)։ Տերը տեսնում է /admin/usage էջում։
CREATE TABLE IF NOT EXISTS client_errors (
  fingerprint TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '',
  last_path TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS client_errors_last_seen ON client_errors (last_seen);
