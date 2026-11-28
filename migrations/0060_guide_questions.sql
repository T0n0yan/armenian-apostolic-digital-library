-- Հարց ու պատասխան կենտրոն (/church/questions) և «ինչ էին փնտրում ու չգտան» (անանուն. միայն բառը և օրը)։
CREATE TABLE IF NOT EXISTS guide_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS guide_questions_topic ON guide_questions (topic, sort);

-- Ոչինչ չգտած որոնումներ. առանց հաշվի և IP-ի, պահվում է 90 օր (retention.server.ts)։
CREATE TABLE IF NOT EXISTS search_misses (
  query TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'church',
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (query, day, source)
);
CREATE INDEX IF NOT EXISTS search_misses_day ON search_misses (day);

UPDATE guides SET status = 'review' WHERE slug = 'questions' AND status = 'draft';

INSERT INTO guide_questions (topic, question, answer, status, sort) VALUES
 ('faith', 'Ինչո՞ւ է մեր Եկեղեցին կոչվում Առաքելական', 'Որովհետև Հայաստանում քրիստոնեությունը քարոզեցին Քրիստոսի առաքյալներ Թադեոսը և Բարթողիմեոսը։ ⚑ Ճշտել', 'review', 10),
 ('faith', 'Ի՞նչ է նշանակում «Աստվածածին»', 'Սուրբ Կույս Մարիամը կոչվում է Աստվածածին, որովհետև նրանից ծնվածը Աստծո Որդին է՝ կատարյալ Աստված և կատարյալ մարդ։ ⚑ Ճշտել', 'review', 20),
 ('sacraments', 'Կարելի՞ է մկրտվել մեծ տարիքում', 'Այո։ Մկրտությունը կարելի է ստանալ ցանկացած տարիքում. չափահասը նախապես պատրաստվում է քահանայի հետ զրույցներով։ ⚑ Ճշտել', 'review', 10),
 ('sacraments', 'Ով կարող է կնքահայր լինել', 'Մկրտված և Հայ Առաքելական Եկեղեցու հավատքը դավանող չափահաս մարդը, ով պատրաստ է օգնել երեխայի հոգևոր դաստիարակությանը։ ⚑ Ճշտել', 'review', 20),
 ('liturgy', 'Քանի՞ անգամ կարելի է հաղորդվել', 'Եկեղեցին հորդորում է հաճախ հաղորդվել՝ պատրաստվելով խոստովանությամբ, պահքով և աղոթքով։ Ձեր դեպքի համար խորհրդակցեք քահանայի հետ։ ⚑ Ճշտել', 'review', 10),
 ('liturgy', 'Կարելի՞ է ուշանալ Պատարագից', 'Լավ է գալ սկզբից։ Եթե ուշացել եք, մտեք հանգիստ և միացեք աղոթքին՝ չխանգարելով ուրիշներին։ ⚑ Ճշտել', 'review', 20),
 ('fasting', 'Պահքի ժամանակ կարելի՞ է հաղորդվել', 'Այո, պահքը լավագույն նախապատրաստությունն է Հաղորդության համար։ ⚑ Ճշտել', 'review', 10),
 ('departed', 'Կարելի՞ է հոգեհանգիստ պատվիրել ոչ մկրտված մարդու համար', 'Այս հարցի պատասխանը տալիս է քահանան՝ ըստ դեպքի։ Աղոթել կարելի է բոլորի համար։ ⚑ Ճշտել', 'review', 10),
 ('departed', 'Ինչո՞ւ են մոմ վառում ննջեցյալների համար', 'Մոմը աղոթքի նշան է. վառելով այն՝ աղոթում ենք ննջեցյալի հոգու հանգստության համար։ ⚑ Ճշտել', 'review', 20),
 ('family', 'Կարելի՞ է պսակվել այլ դավանանքի մարդու հետ', 'Սա որոշվում է թեմի առաջնորդի թույլտվությամբ։ Դիմեք ձեր ծխի քահանային։ ⚑ Ճշտել', 'review', 10),
 ('church', 'Կարելի՞ է եկեղեցի գնալ ոչ կիրակի օրը', 'Այո։ Եկեղեցիները բաց են ամեն օր. կարելի է մտնել, մոմ վառել և աղոթել։ ⚑ Ճշտել', 'review', 10);
