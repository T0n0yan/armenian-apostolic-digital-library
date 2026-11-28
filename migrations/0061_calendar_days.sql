-- Տոնացույցի ձեռքով ուղղումներ (/admin/calendar)՝ ըստ Մայր Աթոռի տարեկան տոնացույցի։
-- hide = 1՝ թաքցնել հաշվարկված տողը (նույն օր և վերնագիր), hide = 0՝ ավելացնել նոր տող։
CREATE TABLE IF NOT EXISTS calendar_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'feast' CHECK (kind IN ('taghavar', 'feast', 'memorial', 'fast')),
  hide INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS calendar_days_day ON calendar_days (day);

UPDATE guides SET status = 'review' WHERE slug = 'calendar' AND status = 'draft';
