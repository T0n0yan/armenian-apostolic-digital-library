import { remember } from "./memory-cache.server";
import { blockedWords, isPlaceKind, placeSlug, type PlaceKind } from "../utils/places";

export type Place = {
  id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; region: string;
  description: string; clergy: string; services: string; accessibility: string; active: string; liturgy: string; openHours: string;
  videoUrl: string; icon: string | null;
  photos: string[]; creditName: string; verified: boolean; published: boolean; updatedAt: string;
  /** Brought in from OpenStreetMap (scripts/import-osm-places.py): its id there (n123, w45, r6) and Wikidata item. */
  fromOsm: boolean; osmId: string; wikidata: string;
};

export type PlaceSubmission = {
  id: number; senderName: string; placeName: string; credit: boolean | null; creditName: string; latitude: number | null; longitude: number | null;
  notes: string; clergy: string; services: string; accessibility: string; kind: string; kindNote: string; region: string; active: string; liturgy: string; openHours: string; photos: string[]; videos: string[]; createdAt: string;
};

type PlaceRow = {
  id: string; name: string; kind: string; latitude: number; longitude: number; region: string; description: string;
  clergy: string; services: string; accessibility?: string; active?: string; liturgy?: string; open_hours?: string; video_url: string; icon: string | null; photos_json: string; credit_name: string;
  verified: number; published: number; updated_at: string; osm_id?: string | null; wikidata?: string;
};

const list = (json: string) => {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
};

function toPlace(row: PlaceRow): Place {
  return {
    id: row.id, name: row.name, kind: isPlaceKind(row.kind) ? row.kind : "church", latitude: row.latitude, longitude: row.longitude,
    region: row.region, description: row.description, clergy: row.clergy, services: row.services, accessibility: row.accessibility ?? "",
    active: row.active ?? "", liturgy: row.liturgy ?? "", openHours: row.open_hours ?? "", videoUrl: row.video_url,
    icon: row.icon, photos: list(row.photos_json), creditName: row.credit_name, verified: Boolean(row.verified),
    published: Boolean(row.published), updatedAt: row.updated_at, fromOsm: Boolean(row.osm_id), osmId: row.osm_id ?? "", wikidata: row.wikidata ?? "",
  };
}

/** Published places never include one whose name has a blocklist word, even if it was shown by mistake. */
export async function listPlaces(db: D1Database, { publishedOnly }: { publishedOnly: boolean }) {
  const { results } = await db.prepare(`SELECT * FROM places ${publishedOnly ? "WHERE published = 1" : ""} ORDER BY name`).all<PlaceRow>();
  const places = results.map(toPlace);
  if (!publishedOnly) return places;
  const words = await listBlocklist(db);
  return places.filter((place) => !blockedWords(place.name, words).length);
}

/** Small, shared public map/search projection. Private/admin rows never enter this cache. */
export async function listPublicPlaceSummaries(db: D1Database) {
  return remember(db, "public-places", 30_000, async () => {
    const { results } = await db.prepare(`SELECT id, name, kind, latitude, longitude, region,
      substr(description, 1, 180) AS description, icon, json_extract(photos_json, '$[0]') AS cover,
      verified, updated_at FROM places WHERE published = 1 ORDER BY name`).all<{
        id: string; name: string; kind: string; latitude: number; longitude: number; region: string;
        description: string; icon: string | null; cover: string | null; verified: number; updated_at: string;
      }>();
    const words = await listBlocklist(db);
    return results.filter((row) => !blockedWords(row.name, words).length).map((row) => ({
      id: row.id, name: row.name, kind: isPlaceKind(row.kind) ? row.kind : "church" as PlaceKind,
      latitude: row.latitude, longitude: row.longitude, region: row.region, description: row.description,
      icon: row.icon, cover: row.cover, verified: Boolean(row.verified), updatedAt: row.updated_at,
    }));
  });
}

export async function getPlace(db: D1Database, id: string, { publishedOnly = false } = {}) {
  const row = await db.prepare("SELECT * FROM places WHERE id = ?").bind(id).first<PlaceRow>();
  if (!row) return null;
  if (publishedOnly && (!row.published || blockedWords(row.name, await listBlocklist(db)).length)) return null;
  return toPlace(row);
}

/** The blocklist: words that mark a church of another denomination. */
export async function listBlocklist(db: D1Database) {
  const { results } = await db.prepare("SELECT word FROM place_blocklist ORDER BY word").all<{ word: string }>();
  return results.map((row) => row.word);
}

export function addBlocklistWord(db: D1Database, word: string) {
  return db.prepare("INSERT OR IGNORE INTO place_blocklist (word) VALUES (?)").bind(word.trim().replace(/\s+/gu, " ").toLocaleLowerCase("hy").slice(0, 60)).run();
}

export function removeBlocklistWord(db: D1Database, word: string) {
  return db.prepare("DELETE FROM place_blocklist WHERE word = ?").bind(word).run();
}

/** The admin's own «Եղել եմ» marks, hidden places included. */
export async function listVisitedIds(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT place_id FROM place_visits WHERE user_id = ?").bind(userId).all<{ place_id: string }>();
  return results.map((row) => row.place_id);
}

export function setVisited(db: D1Database, userId: string, placeId: string, visited: boolean) {
  return visited
    ? db.prepare("INSERT OR IGNORE INTO place_visits (user_id, place_id) SELECT ?, id FROM places WHERE id = ?").bind(userId, placeId).run()
    : db.prepare("DELETE FROM place_visits WHERE user_id = ? AND place_id = ?").bind(userId, placeId).run();
}

export async function listOpenSubmissions(db: D1Database): Promise<PlaceSubmission[]> {
  const { results } = await db.prepare("SELECT * FROM place_submissions WHERE status = 'open' AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 50").all<{
    id: number; sender_name: string; place_name: string; credit: number | null; credit_name: string; latitude: number | null; longitude: number | null; notes: string;
    clergy: string; services: string; accessibility: string; kind: string; kind_note: string; region: string; active: string; liturgy: string; open_hours: string;
    photos_json: string; videos_json: string; created_at: string;
  }>();
  return results.map((row) => ({
    id: row.id, senderName: row.sender_name, placeName: row.place_name ?? "", credit: row.credit === null ? null : Boolean(row.credit),
    creditName: row.credit_name ?? "", clergy: row.clergy ?? "", services: row.services ?? "", accessibility: row.accessibility ?? "",
    kind: row.kind ?? "", kindNote: row.kind_note ?? "", region: row.region ?? "", active: row.active ?? "", liturgy: row.liturgy ?? "", openHours: row.open_hours ?? "", latitude: row.latitude,
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

type NewPlace = {
  name: string; latitude: number; longitude: number; kind?: string; region?: string; creditName?: string; notes?: string; clergy?: string; services?: string;
  accessibility?: string; active?: string; liturgy?: string; openHours?: string;
};

export async function createPlace(db: D1Database, fields: NewPlace) {
  const id = await freeId(db, fields.name);
  await db.prepare(
    `INSERT INTO places (id, name, kind, region, latitude, longitude, credit_name, description, clergy, services, accessibility, active, liturgy, open_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, fields.name, isPlaceKind(fields.kind) ? fields.kind : "church", fields.region ?? "", fields.latitude, fields.longitude, fields.creditName ?? "", fields.notes ?? "",
    fields.clergy ?? "", fields.services ?? "", fields.accessibility ?? "", fields.active ?? "", fields.liturgy ?? "", fields.openHours ?? "").run();
  return id;
}

export type PlaceFields = Pick<Place, "name" | "kind" | "latitude" | "longitude" | "region" | "description" | "clergy" | "services" | "accessibility" | "active" | "liturgy" | "openHours" | "videoUrl" | "creditName" | "verified" | "published">;

export function updatePlace(db: D1Database, id: string, fields: PlaceFields) {
  return db.prepare(
    `UPDATE places SET name = ?, kind = ?, latitude = ?, longitude = ?, region = ?, description = ?, clergy = ?, services = ?, accessibility = ?, active = ?, liturgy = ?, open_hours = ?,
       video_url = ?, credit_name = ?, verified = ?, published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  ).bind(fields.name, fields.kind, fields.latitude, fields.longitude, fields.region, fields.description, fields.clergy, fields.services, fields.accessibility, fields.active, fields.liturgy, fields.openHours,
    fields.videoUrl, fields.creditName, fields.verified ? 1 : 0, fields.published ? 1 : 0, id).run();
}

/** Shows or hides places on the public map: one place, or every place of a kind. Nothing else changes. */
export function setPlacesPublished(db: D1Database, published: boolean, target: { id: string } | { kind: PlaceKind }) {
  const [where, value] = "id" in target ? ["id = ?", target.id] : ["kind = ?", target.kind];
  return db.prepare(`UPDATE places SET published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ${where} AND published <> ?`)
    .bind(published ? 1 : 0, value, published ? 1 : 0).run();
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
  // An OpenStreetMap place is remembered, so a later import doesn't bring it back.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO place_rejected (osm_id, name) SELECT osm_id, name FROM places WHERE id = ? AND osm_id IS NOT NULL AND osm_id <> ''").bind(id),
    db.prepare("DELETE FROM places WHERE id = ?").bind(id),
  ]);
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
    creditName: submission.credit ? submission.creditName || submission.senderName : "",
    notes: [submission.kindNote ? `Տեսակը (ուղարկողի խոսքով)՝ ${submission.kindNote}` : "", submission.notes].filter(Boolean).join("\n\n"),
    clergy: submission.clergy, services: submission.services, accessibility: submission.accessibility, kind: submission.kind, region: submission.region,
    active: submission.active, liturgy: submission.liturgy, openHours: submission.openHours,
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
