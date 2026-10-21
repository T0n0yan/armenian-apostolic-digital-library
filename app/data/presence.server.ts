export type Platform = "ios" | "android" | "windows" | "macos" | "linux" | "other";
const PLATFORMS: Platform[] = ["ios", "android", "windows", "macos", "linux", "other"];

export function validPlatform(value: unknown): Platform {
  return PLATFORMS.includes(value as Platform) ? value as Platform : "other";
}

/**
 * Notes that a device has a page open. Writes at most every four minutes per device. Anonymous:
 * a random id from the browser, the kind of system and the time; never the reader's account.
 */
export async function touchPresence(database: D1Database, entry: { visitorId: string; platform: Platform; inTelegram: boolean }) {
  await database.prepare(
    `INSERT INTO site_presence (visitor_id, platform, in_telegram) VALUES (?, ?, ?)
     ON CONFLICT (visitor_id) DO UPDATE SET platform = excluded.platform, in_telegram = excluded.in_telegram, last_seen = excluded.last_seen
     WHERE site_presence.last_seen < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 minutes')`,
  ).bind(entry.visitorId, entry.platform, entry.inTelegram ? 1 : 0).run();
}

/** Numbers for the admin page: accounts, devices of the last 30 days, and how many are online now. */
export async function siteStats(database: D1Database) {
  const [accounts, devices, online] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN telegram_id LIKE 'google:%' THEN 1 ELSE 0 END) AS google,
        SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') THEN 1 ELSE 0 END) AS week
      FROM app_users`).first<{ total: number; google: number | null; week: number | null }>(),
    database.prepare(`SELECT platform, COUNT(*) AS count, SUM(in_telegram) AS telegram FROM site_presence
      WHERE last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') GROUP BY platform ORDER BY count DESC`)
      .all<{ platform: Platform; count: number; telegram: number }>(),
    database.prepare(`SELECT COUNT(*) AS total FROM site_presence
      WHERE last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 minutes')`).first<{ total: number }>(),
  ]);
  const total = accounts?.total ?? 0;
  const google = accounts?.google ?? 0;
  return {
    accounts: { total, telegram: total - google, google, week: accounts?.week ?? 0 },
    devices: devices.results,
    online: { total: online?.total ?? 0 },
  };
}
