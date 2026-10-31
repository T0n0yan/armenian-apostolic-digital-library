import type { TelegramUserIdentity } from "../auth/telegram-user.server";
import { readSubmission, regionFor, teamSummary } from "./place-intake.server";
import { notifyPlacesTeam } from "./telegram-bot-replies.server";
import { OPEN_LIMIT, PHOTO_TYPES, WEB_PHOTO_LIMIT, type WebPlace } from "../utils/place-web-form";

/**
 * /places/new: a place sent from the site by a signed-in reader (Google or Telegram), with the
 * same answers as the bot's /place. It goes to the same «Նոր առաջարկներ» list in /admin/places and
 * the team's places topic; nothing is published until an admin makes a place of it.
 */
/** How many places this reader has sent that the team hasn't handled yet. */
export async function openWebPlaces(db: D1Database, userId: string) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM place_submissions WHERE user_id = ? AND status = 'open'").bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
}

/** Saves the place as a sent submission, stores its photos in R2, and tells the team. */
export async function createWebPlace(db: D1Database, bucket: R2Bucket, user: TelegramUserIdentity, { fields, photos }: WebPlace, fetcher: typeof fetch = fetch) {
  if (await openWebPlaces(db, user.id) >= OPEN_LIMIT) return { error: "Դուք արդեն ուղարկել եք մի քանի տեղ, որոնք դեռ դիտվում են։ Փորձեք մի փոքր ուշ։" };
  const point = fields.point!;
  const region = fields.region || await regionFor(point, fetcher);
  const telegramId = /^\d{1,20}$/u.test(user.telegramId) ? Number(user.telegramId) : 0;
  const inserted = await db.prepare(
    `INSERT INTO place_submissions (telegram_id, user_id, source, sender_name, place_name, kind, region, latitude, longitude, active, liturgy, services, clergy,
       open_hours, accessibility, notes, credit, credit_name, submitted_at)
     VALUES (?, ?, 'web', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) RETURNING id`,
  ).bind(telegramId, user.id, user.displayName.slice(0, 120), fields.name, fields.kind, region, point.latitude, point.longitude, fields.active, fields.liturgy, fields.services,
    fields.clergy, fields.openHours, fields.accessibility, fields.notes, fields.credit ? 1 : 0, fields.creditName || (fields.credit ? user.displayName : "")).first<{ id: number }>();
  if (!inserted) return { error: "Չհաջողվեց պահել։ Փորձեք նորից։" };
  const keys: string[] = [];
  for (const file of photos.slice(0, WEB_PHOTO_LIMIT)) {
    const key = `submissions/${inserted.id}/photo-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}.${PHOTO_TYPES[file.type]}`;
    await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    keys.push(`r2:${key}`);
  }
  if (keys.length) await db.prepare("UPDATE place_submissions SET photos_json = ? WHERE id = ?").bind(JSON.stringify(keys), inserted.id).run();
  const row = await readSubmission(db, inserted.id);
  if (row) {
    const from = `📍 Սրբավայր կայքից · ${user.displayName}${user.username ? ` · @${user.username}` : ""} · ${user.source === "google" ? "Google" : "Telegram"}`;
    await notifyPlacesTeam(`${from}\n\n${teamSummary(row, 400)}${keys.length ? `\n📷 Նկարներ՝ ${keys.length}` : ""}\n\nԴիտել և հաստատել՝ /admin/places`).catch(() => false);
  }
  return { id: inserted.id };
}
