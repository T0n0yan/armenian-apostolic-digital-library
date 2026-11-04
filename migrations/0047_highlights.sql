-- Ընթերցողի նշումները տեքստում. պահված խոսք (mark) կամ հարց (question), սմայլիկ, նոթ, պատասխան։
-- Տողը գտնվում է իր տեքստով և շրջակա բառերով (prefix/suffix), ոչ թե էջի մեջ իր դիրքով։
-- Բաժինը, վերնագիրը և հասցեն պահվում են այնպես, ինչպես էին պահելու պահին («Նշումներ» էջի համար)։
CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  kind TEXT NOT NULL DEFAULT 'mark' CHECK (kind IN ('mark', 'question')),
  quote TEXT NOT NULL CHECK (length(quote) BETWEEN 1 AND 1200),
  prefix TEXT NOT NULL DEFAULT '' CHECK (length(prefix) <= 64),
  suffix TEXT NOT NULL DEFAULT '' CHECK (length(suffix) <= 64),
  emoji TEXT NOT NULL DEFAULT '' CHECK (length(emoji) <= 16),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 4000),
  answer TEXT NOT NULL DEFAULT '' CHECK (length(answer) <= 4000),
  answered_at TEXT,
  section TEXT NOT NULL DEFAULT '' CHECK (length(section) <= 120),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 300),
  path TEXT NOT NULL DEFAULT '' CHECK (length(path) <= 300),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_highlights_user_date ON highlights(user_id, created_at DESC);
CREATE INDEX idx_highlights_material ON highlights(user_id, chat_id, message_id);
