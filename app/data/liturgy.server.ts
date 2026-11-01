import { archiveBefore, feastOn, longestStreak, periodRange, sundayToAsk } from "../utils/liturgy";

/**
 * Կիրակնօրյա հարցը (Պատարագ, Հաղորդություն), «Իմ ամիսը / Իմ տարին» ամփոփումը,
 * տվյալների ներբեռնումը և տարեկան մաքրումը։ Ամեն ինչ մեկ մարդու տվյալներով է. ուրիշը չի տեսնում։
 */

/** Հարցնե՞լ այս մարդուն հիմա. կիրակի 13:00 → երկուշաբթի, եթե չի պատասխանել և չի անջատել։ */
export async function sundayQuestion(db: D1Database, userId: string, now = Date.now()) {
  const day = sundayToAsk(now);
  if (!day) return { day: null, ask: false, feast: null };
  const [settings, mark] = await Promise.all([
    db.prepare("SELECT sunday_prompt FROM user_settings WHERE user_id = ?").bind(userId).first<{ sunday_prompt: number }>(),
    db.prepare("SELECT 1 FROM liturgy_marks WHERE user_id = ? AND day = ?").bind(userId, day).first(),
  ]);
  return { day, ask: (settings?.sunday_prompt ?? 1) === 1 && !mark, feast: feastOn(day) };
}

/** Պատասխանը պահվում է այդ օրվա համար (կրկին պատասխանելիս՝ փոխվում)։ note՝ առիթը (ձեռքով նշելիս)։ */
export function saveSundayAnswer(db: D1Database, userId: string, day: string, attended: boolean, communion: boolean, note = "") {
  return db.prepare(
    `INSERT INTO liturgy_marks (user_id, day, attended, communion, note) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET attended = excluded.attended, communion = excluded.communion,
       note = CASE WHEN excluded.note <> '' THEN excluded.note ELSE liturgy_marks.note END`,
  ).bind(userId, day, attended ? 1 : 0, attended && communion ? 1 : 0, note.slice(0, 120)).run();
}

/** Ձեռքով նշված օրը հանել (սխալ նշելու դեպքում)։ */
export function removeLiturgyMark(db: D1Database, userId: string, day: string) {
  return db.prepare("DELETE FROM liturgy_marks WHERE user_id = ? AND day = ?").bind(userId, day).run();
}

/** Ժամանակաշրջանի Պատարագները՝ օրերով և առիթով («Իմ տարին»-ի ցուցակի համար)։ */
export async function listLiturgyMarks(db: D1Database, userId: string, period: string) {
  const range = periodRange(period);
  if (!range) return [];
  const { results } = await db.prepare("SELECT day, communion, note FROM liturgy_marks WHERE user_id = ? AND attended = 1 AND day BETWEEN ? AND ? ORDER BY day DESC")
    .bind(userId, range.from, range.to).all<{ day: string; communion: number; note: string }>();
  return results.map((row) => ({ day: row.day, communion: Boolean(row.communion), note: row.note || feastOn(row.day) || "" }));
}

/** «Չհարցնել այլևս» (false) կամ նորից միացնել (true)։ */
export function setSundayPrompt(db: D1Database, userId: string, on: boolean) {
  return db.prepare(
    `INSERT INTO user_settings (user_id, sunday_prompt) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET sunday_prompt = excluded.sunday_prompt, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(userId, on ? 1 : 0).run();
}

export async function sundayPromptOn(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT sunday_prompt FROM user_settings WHERE user_id = ?").bind(userId).first<{ sunday_prompt: number }>();
  return (row?.sunday_prompt ?? 1) === 1;
}

export type PersonalSummary = {
  period: string; kind: "month" | "year";
  liturgies: number; communions: number;
  read: number; listened: number; watched: number;
  activeDays: number; longestStreak: number;
  sections: Array<{ name: string; count: number }>;
  places: number; saved: number; savedVerses: number;
  /** Տարվա համար՝ ամիսներով (Պատարագներ և կարդացածներ), գրաֆիկի համար։ */
  months?: Array<{ month: string; liturgies: number; read: number }>;
};

/** Մարդու ամսվա կամ տարվա ամփոփումը։ Մաքրված տարվա համար՝ պահված ամփոփումը։ */
export async function personalSummary(db: D1Database, userId: string, period: string): Promise<PersonalSummary | null> {
  const range = periodRange(period);
  if (!range) return null;
  if (range.kind === "year") {
    const archived = await db.prepare("SELECT data_json FROM yearly_summaries WHERE user_id = ? AND year = ?").bind(userId, Number(period)).first<{ data_json: string }>();
    if (archived) return JSON.parse(archived.data_json) as PersonalSummary;
  }
  const between = [userId, range.from, range.to] as const;
  const [liturgy, reading, sections, days, places, saved, verses] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(attended), 0) AS liturgies, COALESCE(SUM(communion), 0) AS communions FROM liturgy_marks WHERE user_id = ? AND day BETWEEN ? AND ?").bind(...between).first<{ liturgies: number; communions: number }>(),
    db.prepare("SELECT kind, COUNT(*) AS count FROM reading_log WHERE user_id = ? AND day BETWEEN ? AND ? GROUP BY kind").bind(...between).all<{ kind: string; count: number }>(),
    db.prepare(
      `SELECT COALESCE(topics.title, 'Այլ') AS name, COUNT(*) AS count FROM reading_log AS log
       LEFT JOIN library_materials AS materials ON materials.chat_id = log.chat_id AND materials.message_id = log.message_id
       LEFT JOIN library_topics AS topics ON topics.id = materials.topic_key
       WHERE log.user_id = ? AND log.day BETWEEN ? AND ? GROUP BY name ORDER BY count DESC LIMIT 6`,
    ).bind(...between).all<{ name: string; count: number }>(),
    db.prepare("SELECT DISTINCT day FROM reading_log WHERE user_id = ? AND day BETWEEN ? AND ?").bind(...between).all<{ day: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM place_visits WHERE user_id = ? AND substr(visited_at, 1, 10) BETWEEN ? AND ?").bind(...between).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM saved_materials WHERE user_id = ? AND substr(saved_at, 1, 10) BETWEEN ? AND ?").bind(...between).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM saved_verses WHERE user_id = ? AND substr(saved_at, 1, 10) BETWEEN ? AND ?").bind(...between).first<{ count: number }>().catch(() => ({ count: 0 })),
  ]);
  const byKind = new Map(reading.results.map((row) => [row.kind, row.count]));
  const summary: PersonalSummary = {
    period, kind: range.kind,
    liturgies: liturgy?.liturgies ?? 0, communions: liturgy?.communions ?? 0,
    read: (byKind.get("read") ?? 0) + (byKind.get("quiz") ?? 0), listened: byKind.get("listen") ?? 0, watched: byKind.get("watch") ?? 0,
    activeDays: days.results.length, longestStreak: longestStreak(days.results.map((row) => row.day)),
    sections: sections.results, places: places?.count ?? 0, saved: saved?.count ?? 0, savedVerses: verses?.count ?? 0,
  };
  if (range.kind === "year") {
    const [liturgyMonths, readMonths] = await Promise.all([
      db.prepare("SELECT substr(day, 1, 7) AS month, SUM(attended) AS count FROM liturgy_marks WHERE user_id = ? AND day BETWEEN ? AND ? GROUP BY month").bind(...between).all<{ month: string; count: number }>(),
      db.prepare("SELECT substr(day, 1, 7) AS month, COUNT(*) AS count FROM reading_log WHERE user_id = ? AND day BETWEEN ? AND ? GROUP BY month").bind(...between).all<{ month: string; count: number }>(),
    ]);
    const liturgyBy = new Map(liturgyMonths.results.map((row) => [row.month, row.count]));
    const readBy = new Map(readMonths.results.map((row) => [row.month, row.count]));
    summary.months = Array.from({ length: 12 }, (_, index) => {
      const month = `${period}-${String(index + 1).padStart(2, "0")}`;
      return { month, liturgies: liturgyBy.get(month) ?? 0, read: readBy.get(month) ?? 0 };
    });
  }
  return summary;
}

/** Մարդու տարվա բոլոր գրառումները՝ ներբեռնելու համար (մաքրումից առաջ)։ */
export async function personalYearData(db: D1Database, userId: string, year: number) {
  const between = [userId, `${year}-01-01`, `${year}-12-31`] as const;
  const [summary, liturgy, reading, places] = await Promise.all([
    personalSummary(db, userId, String(year)),
    db.prepare("SELECT day, attended, communion FROM liturgy_marks WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day").bind(...between).all(),
    db.prepare(
      `SELECT log.day, log.kind, materials.title FROM reading_log AS log
       LEFT JOIN library_materials AS materials ON materials.chat_id = log.chat_id AND materials.message_id = log.message_id
       WHERE log.user_id = ? AND log.day BETWEEN ? AND ? ORDER BY log.day`,
    ).bind(...between).all(),
    db.prepare("SELECT places.name, visits.visited_at FROM place_visits AS visits LEFT JOIN places ON places.id = visits.place_id WHERE visits.user_id = ? AND substr(visits.visited_at, 1, 10) BETWEEN ? AND ?").bind(...between).all(),
  ]);
  return { year, summary, liturgy: liturgy.results, reading: reading.results, places: places.results };
}

/**
 * Տարեկան մաքրում (ամեն գիշեր, ստուգումով). փետրվարի 1-ից նախորդ տարվա օրական գրառումները
 * դառնում են մեկ ամփոփ տող (yearly_summaries), իսկ մանրամասները ջնջվում են։
 * Մեկ գիշերում՝ սահմանափակ քանակ, որ անվճար սահմանը չանցնի. մնացածը՝ հաջորդ գիշերը։
 */
export async function archiveOldYears(db: D1Database, now = Date.now(), batch = 40) {
  const before = archiveBefore(now);
  const { results } = await db.prepare(
    `SELECT user_id, substr(day, 1, 4) AS year FROM reading_log WHERE day < ?
     UNION SELECT user_id, substr(day, 1, 4) AS year FROM liturgy_marks WHERE day < ?
     LIMIT ?`,
  ).bind(before, before, batch).all<{ user_id: string; year: string }>();
  for (const row of results) {
    const summary = await personalSummary(db, row.user_id, row.year);
    if (!summary) continue;
    const from = `${row.year}-01-01`;
    const to = `${row.year}-12-31`;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO yearly_summaries (user_id, year, data_json) VALUES (?, ?, ?)").bind(row.user_id, Number(row.year), JSON.stringify(summary)),
      db.prepare("DELETE FROM reading_log WHERE user_id = ? AND day BETWEEN ? AND ?").bind(row.user_id, from, to),
      db.prepare("DELETE FROM liturgy_marks WHERE user_id = ? AND day BETWEEN ? AND ?").bind(row.user_id, from, to),
    ]);
  }
  return results.length;
}

/**
 * Կիրակնօրյա ծանուցում ստացողների հաջորդ խումբը. ովքեր չեն անջատել հարցը, դեռ չեն պատասխանել,
 * և ունեն Telegram (բոտը կարող է գրել) կամ միացված ծանուցումներ բրաուզերում։
 */
export async function sundayRecipients(db: D1Database, day: string, afterId: string, limit: number) {
  const { results } = await db.prepare(
    `SELECT users.id, users.telegram_id FROM app_users AS users
     LEFT JOIN user_settings AS settings ON settings.user_id = users.id
     WHERE users.id > ? AND COALESCE(settings.sunday_prompt, 1) = 1
       AND NOT EXISTS (SELECT 1 FROM liturgy_marks AS marks WHERE marks.user_id = users.id AND marks.day = ?)
       AND (users.telegram_id GLOB '[0-9]*' OR EXISTS (SELECT 1 FROM push_subscriptions AS subs WHERE subs.user_id = users.id))
     ORDER BY users.id LIMIT ?`,
  ).bind(afterId, day, limit).all<{ id: string; telegram_id: string }>();
  return results;
}
