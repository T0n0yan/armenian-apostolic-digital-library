import { archiveOldYears } from "./liturgy.server";

/**
 * Nightly clean-up (workers/app.ts `scheduled`). Everywhere: unfinished /place conversations and what
 * they entered after a day, and a submission the team has handled after 30 days (the place itself keeps only the name the
 * sender agreed to). On staging (TEST_DATA_DAYS set) test data older than that many days goes too.
 */
export async function removeOldData(db: D1Database, testDataDays?: string) {
  const statements = [
    db.prepare("DELETE FROM bot_place_drafts WHERE updated_at < ?").bind(Date.now() - 24 * 60 * 60 * 1000),
    db.prepare("DELETE FROM place_submissions WHERE handled_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    // Started with /place but never sent: nothing the reader confirmed is kept.
    db.prepare("DELETE FROM place_submissions WHERE submitted_at IS NULL AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')"),
    // Բրաուզերի սխալներ (client-errors.server.ts)՝ 30 օր։
    db.prepare("DELETE FROM client_errors WHERE last_seen < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    // 3D եկեղեցու մոմերը վառվում են մինչև օրվա վերջ. 3 օրից հին տողերը պետք չեն։
    db.prepare("DELETE FROM church_candles WHERE day < date('now', '-3 days')"),
    db.prepare("DELETE FROM church_candle_totals WHERE day < date('now', '-3 days')"),
  ];
  const days = Number(testDataDays);
  if (Number.isInteger(days) && days > 0) {
    const cutoff = `-${days} days`;
    statements.push(
      db.prepare("DELETE FROM place_submissions WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").bind(cutoff),
      db.prepare("DELETE FROM place_visits WHERE visited_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").bind(cutoff),
      db.prepare("DELETE FROM site_presence WHERE last_seen < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").bind(cutoff),
    );
  }
  await db.batch(statements);
  // Փետրվարի 1-ից՝ նախորդ տարվա օրական գրառումները դառնում են մեկ ամփոփ տող (liturgy.server.ts)։
  await archiveOldYears(db).catch((error: unknown) => console.error("year archive", error));
}
