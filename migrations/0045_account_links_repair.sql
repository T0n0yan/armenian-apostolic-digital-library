-- Google-ը Telegram-ին միացնելիս «Եղել եմ», Պատարագի նշումները և կարգավորումները չէին տեղափոխվում
-- (մնում էին Google հաշվի տակ և չէին երևում)։ Այստեղ դրանք տեղափոխվում են արդեն միացված հաշիվների համար.
-- երկուսում էլ եղածը՝ Telegram-ինը մնում է։
UPDATE OR IGNORE place_visits SET user_id = (SELECT user_id FROM account_links WHERE alias_id = place_visits.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);
DELETE FROM place_visits WHERE user_id IN (SELECT alias_id FROM account_links);

UPDATE OR IGNORE liturgy_marks SET user_id = (SELECT user_id FROM account_links WHERE alias_id = liturgy_marks.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);
DELETE FROM liturgy_marks WHERE user_id IN (SELECT alias_id FROM account_links);

UPDATE OR IGNORE user_settings SET user_id = (SELECT user_id FROM account_links WHERE alias_id = user_settings.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);
DELETE FROM user_settings WHERE user_id IN (SELECT alias_id FROM account_links);

UPDATE OR IGNORE yearly_summaries SET user_id = (SELECT user_id FROM account_links WHERE alias_id = yearly_summaries.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);
DELETE FROM yearly_summaries WHERE user_id IN (SELECT alias_id FROM account_links);

UPDATE place_submissions SET user_id = (SELECT user_id FROM account_links WHERE alias_id = place_submissions.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);

UPDATE OR IGNORE admin_access SET user_id = (SELECT user_id FROM account_links WHERE alias_id = admin_access.user_id)
  WHERE user_id IN (SELECT alias_id FROM account_links);
