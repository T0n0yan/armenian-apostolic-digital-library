-- Privacy-safe aggregate search counters. Query text and user identity are
-- deliberately not stored; query_hash is an HMAC-SHA-256 of server-normalized
-- input using a server-only deployment secret.
CREATE TABLE search_query_aggregates (
  query_hash TEXT NOT NULL CHECK (length(query_hash) = 64),
  query_length INTEGER NOT NULL CHECK (query_length >= 0 AND query_length <= 120),
  scope_key TEXT NOT NULL,
  bucket_date TEXT NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 0 CHECK (query_count >= 0),
  zero_result_count INTEGER NOT NULL DEFAULT 0 CHECK (zero_result_count >= 0),
  result_count_total INTEGER NOT NULL DEFAULT 0 CHECK (result_count_total >= 0),
  click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  last_clicked_chat_id TEXT,
  last_clicked_message_id INTEGER CHECK (last_clicked_message_id IS NULL OR last_clicked_message_id > 0),
  last_searched_at TEXT NOT NULL,
  PRIMARY KEY (query_hash, scope_key, bucket_date)
);

CREATE INDEX idx_search_query_aggregates_retention
  ON search_query_aggregates(bucket_date);
