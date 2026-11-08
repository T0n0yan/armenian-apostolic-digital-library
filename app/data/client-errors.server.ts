/**
 * Բրաուզերի սխալները (app/components/client-error-reporter.tsx → /api/client-error)։ Անանուն են.
 * պահվում են միայն հաղորդագրությունը, ֆայլը, էջի հասցեն և հարթակը (android/ios/desktop)։
 */

export type ClientErrorReport = { message: string; source: string; stack: string; path: string; platform: string };
export type ClientErrorRow = ClientErrorReport & { fingerprint: string; count: number; firstSeen: string; lastSeen: string };

const PLATFORMS = new Set(["android", "ios", "desktop", "telegram-android", "telegram-ios", "telegram-desktop"]);

/** Մուտքի տվյալը՝ կրճատված և մաքրված. սխալ ձև՝ null։ */
export function parseClientError(body: unknown): ClientErrorReport | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const text = (input: unknown, max: number) => (typeof input === "string" ? input : "").replace(/[\u0000-\u0008\u000b-\u001f]/gu, "").slice(0, max).trim();
  const message = text(value.message, 300);
  if (!message) return null;
  // Էջի հասցեն առանց query-ի (որոնման բառեր և այլ տվյալներ չենք պահում)։
  const path = text(value.path, 200).split(/[?#]/u)[0] ?? "";
  const platform = text(value.platform, 20);
  return {
    message,
    source: text(value.source, 200).split(/[?#]/u)[0] ?? "",
    stack: text(value.stack, 1200),
    path: path.startsWith("/") ? path : "",
    platform: PLATFORMS.has(platform) ? platform : "",
  };
}

/** Նույն սխալը նույն ֆայլում՝ մեկ տող (թվերը հաղորդագրությունում փոխարինվում են, որ id-ները չբաժանեն)։ */
export async function errorFingerprint(report: ClientErrorReport) {
  const key = `${report.message.replace(/\d+/gu, "#")}|${report.source.replace(/-[A-Za-z0-9_]{8}\.js$/u, ".js")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function recordClientError(db: D1Database, report: ClientErrorReport) {
  const fingerprint = await errorFingerprint(report);
  await db.prepare(`INSERT INTO client_errors (fingerprint, message, source, stack, last_path, platform)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (fingerprint) DO UPDATE SET count = count + 1, last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  last_path = excluded.last_path, platform = excluded.platform, stack = excluded.stack`)
    .bind(fingerprint, report.message, report.source, report.stack, report.path, report.platform).run();
}

/** Վերջին 7 օրվա սխալները՝ ամենահաճախը առաջինը (/admin/usage)։ */
export async function listClientErrors(db: D1Database, limit = 20): Promise<ClientErrorRow[]> {
  const { results } = await db.prepare(`SELECT fingerprint, message, source, stack, last_path AS path, platform, count, first_seen AS firstSeen, last_seen AS lastSeen
FROM client_errors WHERE last_seen >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') ORDER BY count DESC, last_seen DESC LIMIT ?`).bind(limit).all<ClientErrorRow>();
  return results ?? [];
}
