export type Platform = "ios" | "android" | "windows" | "macos" | "linux" | "other";
const PLATFORMS: Platform[] = ["ios", "android", "windows", "macos", "linux", "other"];

export function validPlatform(value: unknown): Platform {
  return PLATFORMS.includes(value as Platform) ? value as Platform : "other";
}

/** Notes that a device has a page open. Writes at most every two minutes per device. */
export async function touchPresence(database: D1Database, entry: { visitorId: string; userId: string | null; platform: Platform; inTelegram: boolean }) {
  await database.prepare(
    `INSERT INTO site_presence (visitor_id, user_id, platform, in_telegram) VALUES (?, ?, ?, ?)
     ON CONFLICT (visitor_id) DO UPDATE SET user_id = COALESCE(excluded.user_id, site_presence.user_id),
       platform = excluded.platform, in_telegram = excluded.in_telegram, last_seen = excluded.last_seen
     WHERE site_presence.last_seen < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes')
       OR site_presence.user_id IS NOT excluded.user_id`,
  ).bind(entry.visitorId, entry.userId, entry.platform, entry.inTelegram ? 1 : 0).run();
}

/** Numbers for the admin page: accounts, devices of the last 30 days, and who is online now. */
export async function siteStats(database: D1Database) {
  const [accounts, devices, online, onlinePeople] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN telegram_id LIKE 'google:%' THEN 1 ELSE 0 END) AS google,
        SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') THEN 1 ELSE 0 END) AS week
      FROM app_users`).first<{ total: number; google: number | null; week: number | null }>(),
    database.prepare(`SELECT platform, COUNT(*) AS count, SUM(in_telegram) AS telegram FROM site_presence
      WHERE last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') GROUP BY platform ORDER BY count DESC`)
      .all<{ platform: Platform; count: number; telegram: number }>(),
    database.prepare(`SELECT COUNT(*) AS total, COUNT(user_id) AS signed_in FROM site_presence
      WHERE last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes')`).first<{ total: number; signed_in: number }>(),
    database.prepare(`SELECT users.display_name, users.username, users.telegram_id, presence.platform, presence.in_telegram, MAX(presence.last_seen) AS last_seen
      FROM site_presence AS presence INNER JOIN app_users AS users ON users.id = presence.user_id
      WHERE presence.last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes')
      GROUP BY users.id ORDER BY last_seen DESC LIMIT 50`)
      .all<{ display_name: string; username: string | null; telegram_id: string; platform: Platform; in_telegram: number; last_seen: string }>(),
  ]);
  const total = accounts?.total ?? 0;
  const google = accounts?.google ?? 0;
  return {
    accounts: { total, telegram: total - google, google, week: accounts?.week ?? 0 },
    devices: devices.results,
    online: { total: online?.total ?? 0, signedIn: online?.signed_in ?? 0 },
    onlinePeople: onlinePeople.results.map((row) => ({
      name: row.display_name,
      // Google accounts keep their e-mail as the username; Telegram ones their @username.
      contact: row.telegram_id.startsWith("google:") ? row.username : row.username ? `@${row.username}` : null,
      provider: row.telegram_id.startsWith("google:") ? "Google" : "Telegram",
      platform: row.platform,
      inTelegram: Boolean(row.in_telegram),
    })),
  };
}
