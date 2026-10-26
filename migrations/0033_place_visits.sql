-- «Եղել եմ»: the sacred places a signed-in reader marked as visited (guests keep theirs in the
-- browser). Only the reader sees their own marks.
CREATE TABLE place_visits (
  user_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  visited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, place_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
