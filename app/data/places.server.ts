import { isPlaceKind, placeSlug, type PlaceKind } from "../utils/places";

export type Place = {
  id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; region: string;
  description: string; clergy: string; services: string; accessibility: string; videoUrl: string; icon: string | null;
  photos: string[]; creditName: string; verified: boolean; published: boolean; updatedAt: string;
  /** Brought in from OpenStreetMap (scripts/import-osm-places.py). */
  fromOsm: boolean;
};

export type PlaceSubmission = {
  id: number; senderName: string; placeName: string; credit: boolean | null; creditName: string; latitude: number | null; longitude: number | null;
  notes: string; clergy: string; services: string; accessibility: string; photos: string[]; videos: string[]; createdAt: string;
};

type PlaceRow = {
  id: string; name: string; kind: string; latitude: number; longitude: number; region: string; description: string;
  clergy: string; services: string; accessibility?: string; video_url: string; icon: string | null; photos_json: string; credit_name: string;
  verified: number; published: number; updated_at: string; osm_id?: string | null;
};

const list = (json: string) => {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
};

function toPlace(row: PlaceRow): Place {
  return {
    id: row.id, name: row.name, kind: isPlaceKind(row.kind) ? row.kind : "church", latitude: row.latitude, longitude: row.longitude,
    region: row.region, description: row.description, clergy: row.clergy, services: row.services, accessibility: row.accessibility ?? "", videoUrl: row.video_url,
    icon: row.icon, photos: list(row.photos_json), creditName: row.credit_name, verified: Boolean(row.verified),
    published: Boolean(row.published), updatedAt: row.updated_at, fromOsm: Boolean(row.osm_id),
  };
}

export async function listPlaces(db: D1Database, { publishedOnly }: { publishedOnly: boolean }) {
  const { results } = await db.prepare(`SELECT * FROM places ${publishedOnly ? "WHERE published = 1" : ""} ORDER BY name`).all<PlaceRow>();
  return results.map(toPlace);
}

export async function getPlace(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM places WHERE id = ?").bind(id).first<PlaceRow>();
  return row ? toPlace(row) : null;
}

export async function listOpenSubmissions(db: D1Database): Promise<PlaceSubmission[]> {
  const { results } = await db.prepare("SELECT * FROM place_submissions WHERE status = 'open' AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 50").all<{
    id: number; sender_name: string; place_name: string; credit: number | null; credit_name: string; latitude: number | null; longitude: number | null; notes: string;
    clergy: string; services: string; accessibility: string;
    photos_json: string; videos_json: string; created_at: string;
  }>();
  return results.map((row) => ({
    id: row.id, senderName: row.sender_name, placeName: row.place_name ?? "", credit: row.credit === null ? null : Boolean(row.credit),
    creditName: row.credit_name ?? "", clergy: row.clergy ?? "", services: row.services ?? "", accessibility: row.accessibility ?? "", latitude: row.latitude,
    longitude: row.longitude, notes: row.notes, photos: list(row.photos_json), videos: list(row.videos_json), createdAt: row.created_at,
  }));
}

export function dismissSubmission(db: D1Database, id: number) {
  return db.prepare("UPDATE place_submissions SET status = 'dismissed', handled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id).run();
}

/** A free address for a new place: its slug, or the slug with -2, -3… */
async function freeId(db: D1Database, name: string) {
  const base = placeSlug(name);
  for (let suffix = 1; suffix < 50; suffix += 1) {
    const id = suffix === 1 ? base : `${base}-${suffix}`;
    if (!await db.prepare("SELECT 1 FROM places WHERE id = ?").bind(id).first()) return id;
  }
  return `${base}-${Date.now()}`;
}

export async function createPlace(db: D1Database, fields: { name: string; latitude: number; longitude: number; creditName?: string; notes?: string; clergy?: string; services?: string; accessibility?: string }) {
  const id = await freeId(db, fields.name);
  await db.prepare("INSERT INTO places (id, name, latitude, longitude, credit_name, description, clergy, services, accessibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, fields.name, fields.latitude, fields.longitude, fields.creditName ?? "", fields.notes ?? "", fields.clergy ?? "", fields.services ?? "", fields.accessibility ?? "").run();
  return id;
}

export type PlaceFields = Pick<Place, "name" | "kind" | "latitude" | "longitude" | "region" | "description" | "clergy" | "services" | "accessibility" | "videoUrl" | "creditName" | "verified" | "published">;

export function updatePlace(db: D1Database, id: string, fields: PlaceFields) {
  return db.prepare(
    `UPDATE places SET name = ?, kind = ?, latitude = ?, longitude = ?, region = ?, description = ?, clergy = ?, services = ?, accessibility = ?,
       video_url = ?, credit_name = ?, verified = ?, published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  ).bind(fields.name, fields.kind, fields.latitude, fields.longitude, fields.region, fields.description, fields.clergy, fields.services, fields.accessibility,
    fields.videoUrl, fields.creditName, fields.verified ? 1 : 0, fields.published ? 1 : 0, id).run();
}

export function setPlacePictures(db: D1Database, id: string, pictures: { photos?: string[]; icon?: string | null; videoUrl?: string }) {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (pictures.photos) { sets.push("photos_json = ?"); values.push(JSON.stringify(pictures.photos)); }
  if (pictures.icon !== undefined) { sets.push("icon = ?"); values.push(pictures.icon); }
  if (pictures.videoUrl !== undefined) { sets.push("video_url = ?"); values.push(pictures.videoUrl); }
  if (!sets.length) return Promise.resolve();
  return db.prepare(`UPDATE places SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(...values, id).run();
}

export async function deletePlace(db: D1Database, bucket: R2Bucket, id: string) {
  const objects = await bucket.list({ prefix: `places/${id}/` });
  if (objects.objects.length) await bucket.delete(objects.objects.map((object) => object.key));
  await db.prepare("DELETE FROM places WHERE id = ?").bind(id).run();
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };

/** Stores one picture or video of a place in R2 and returns its key. */
export async function storePlaceFile(bucket: R2Bucket, id: string, name: string, body: ArrayBuffer | ReadableStream, type: string) {
  // Unique even for files stored in the same millisecond (several photos in one upload).
  const key = `places/${id}/${name}-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}.${TYPES[type] ?? "bin"}`;
  await bucket.put(key, body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  return key;
}

export const PLACE_UPLOAD_TYPES = Object.keys(TYPES);

/** A file a reader sent to the bot, fetched from Telegram (bots may download files up to 20 MB). */
export async function fetchTelegramFile(token: string, fileId: string) {
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
    .then((response) => response.json() as Promise<{ ok?: boolean; result?: { file_path?: string } }>).catch(() => null);
  const path = info?.ok ? info.result?.file_path : null;
  if (!path) return null;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`).catch(() => null);
  if (!response?.ok) return null;
  const type = /\.png$/iu.test(path) ? "image/png" : /\.(mp4|mov)$/iu.test(path) ? "video/mp4" : "image/jpeg";
  return { body: await response.arrayBuffer(), type };
}

/**
 * Turns a reader's /place submission into an unpublished place: its location and words, their
 * name if they agreed, and their photos and video copied from Telegram into R2.
 */
export async function placeFromSubmission(db: D1Database, bucket: R2Bucket, token: string, submissionId: number, name: string) {
  const submission = (await listOpenSubmissions(db)).find((item) => item.id === submissionId);
  if (!submission || submission.latitude === null || submission.longitude === null) return null;
  const id = await createPlace(db, {
    name, latitude: submission.latitude, longitude: submission.longitude,
    creditName: submission.credit ? submission.creditName || submission.senderName : "", notes: submission.notes,
    clergy: submission.clergy, services: submission.services, accessibility: submission.accessibility,
  });
  const photos: string[] = [];
  for (const fileId of submission.photos.slice(0, 12)) {
    const file = await fetchTelegramFile(token, fileId);
    if (file) photos.push(await storePlaceFile(bucket, id, "photo", file.body, file.type));
  }
  let video = "";
  const firstVideo = submission.videos[0];
  if (firstVideo) {
    const file = await fetchTelegramFile(token, firstVideo);
    if (file) video = await storePlaceFile(bucket, id, "video", file.body, "video/mp4");
  }
  await setPlacePictures(db, id, { photos, ...(video ? { videoUrl: video } : {}) });
  await db.prepare("UPDATE place_submissions SET status = 'used', place_id = ?, handled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id, submissionId).run();
  return id;
}
