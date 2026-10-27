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
}
