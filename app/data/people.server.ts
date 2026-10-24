import type { Platform } from "./presence.server";

/** A signed-in reader (Telegram or Google account), for the admin's list. */
export type Person = {
  id: string;
  telegramId: string;
  displayName: string;
  username: string | null;
  role: "member" | "admin";
  createdAt: string;
  lastSeenAt: string;
};

/** A device that visited without signing in: anonymous (a random id kept in its browser). */
export type Device = {
  platform: Platform;
  inTelegram: boolean;
  firstSeen: string;
  lastSeen: string;
};


function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/gu, (character) => `\\${character}`)}%`;
}

/** Accounts newest first; the query looks in the name, @username and Telegram id. */
export async function listPeople(database: D1Database, options: { query: string; offset: number; limit: number }) {
  const query = options.query.trim().replace(/^@/u, "");
  const where = query ? "WHERE display_name LIKE ?1 ESCAPE '\\' OR username LIKE ?1 ESCAPE '\\' OR telegram_id LIKE ?1 ESCAPE '\\'" : "";
  const bindings = query ? [likePattern(query)] : [];
  const [rows, count] = await Promise.all([
    database.prepare(
      `SELECT id, telegram_id AS telegramId, display_name AS displayName, username, role,
         created_at AS createdAt, last_seen_at AS lastSeenAt
       FROM app_users ${where} ORDER BY created_at DESC LIMIT ${options.limit} OFFSET ${options.offset}`,
    ).bind(...bindings).all<Person>(),
    database.prepare(`SELECT COUNT(*) AS total FROM app_users ${where}`).bind(...bindings).first<{ total: number }>(),
  ]);
  return { people: rows.results, total: count?.total ?? 0 };
}

/** Devices by their first visit, newest first. */
export async function listDevices(database: D1Database, options: { platform: Platform | null; offset: number; limit: number }) {
  const where = options.platform ? "WHERE platform = ?" : "";
  const bindings = options.platform ? [options.platform] : [];
  const [rows, count] = await Promise.all([
    database.prepare(
      `SELECT platform, in_telegram AS inTelegram, first_seen AS firstSeen, last_seen AS lastSeen
       FROM site_presence ${where} ORDER BY first_seen DESC LIMIT ${options.limit} OFFSET ${options.offset}`,
    ).bind(...bindings).all<Omit<Device, "inTelegram"> & { inTelegram: number }>(),
    database.prepare(`SELECT COUNT(*) AS total FROM site_presence ${where}`).bind(...bindings).first<{ total: number }>(),
  ]);
  return {
    devices: rows.results.map((row) => ({ ...row, inTelegram: Boolean(row.inTelegram) })),
    total: count?.total ?? 0,
  };
}
