-- Կիրակնօրյա հարցի պատասխանները. եղե՞լ է Պատարագի (attended), ստացե՞լ է Հաղորդություն (communion)։
-- day — կիրակի օրը (Երևանի ժամով)։ Մեկ օր՝ մեկ պատասխան։
CREATE TABLE liturgy_marks (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  attended INTEGER NOT NULL DEFAULT 0,
  communion INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- Մարդու կարգավորումները. sunday_prompt = 0՝ «Չհարցնել այլևս» (ո՛չ հարց, ո՛չ ծանուցում)։
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  sunday_prompt INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- Նախորդ տարիների ամփոփումը. մանրամասները ջնջվում են փետրվարի 1-ին, մնում է միայն այս մեկ տողը։
CREATE TABLE yearly_summaries (
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, year),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
