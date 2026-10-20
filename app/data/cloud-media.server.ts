type CloudMediaRow = {
  r2_key: string | null;
  thumbnail_r2_key: string | null;
  mime_type: string | null;
};

function mediaHeaders(object: R2Object, contentType: string | null) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    // R2 objects are immutable per key (an edit gets a new key), so clients may keep media for a
    // week; the ETag still lets them revalidate cheaply after that.
    "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    "Content-Type": contentType ?? object.httpMetadata?.contentType ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return headers;
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    const length = Math.min(suffix, size);
    return { start: size - length, end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return false;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export async function readCloudMedia(
  database: D1Database,
  bucket: R2Bucket,
  chatId: string,
  messageId: number,
  mediaIndex: number,
  request: Request,
): Promise<Response> {
  const row = await database.prepare(
    `SELECT media.r2_key, media.thumbnail_r2_key, media.mime_type
     FROM library_media AS media
     INNER JOIN library_materials AS materials
       ON materials.chat_id = media.chat_id AND materials.message_id = media.message_id
     INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE media.chat_id = ? AND media.message_id = ? AND media.media_index = ?
       AND media.status = 'ready' AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden'
     UNION ALL
     SELECT attachment.r2_key, NULL, attachment.mime_type
     FROM material_attachments AS attachment
     INNER JOIN library_materials AS materials
       ON materials.chat_id = attachment.chat_id AND materials.message_id = attachment.message_id
     INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
     WHERE attachment.chat_id = ? AND attachment.message_id = ? AND attachment.media_index = ?
       AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden'
     LIMIT 1`,
  ).bind(chatId, messageId, mediaIndex, chatId, messageId, mediaIndex).first<CloudMediaRow>();
  const thumbnail = new URL(request.url).searchParams.get("thumbnail") === "1";
  const key = thumbnail ? row?.thumbnail_r2_key : row?.r2_key;
  if (!row || !key) return new Response("Media not found", { status: 404 });

  const head = await bucket.head(key);
  if (!head) return new Response("Media not found", { status: 404 });
  // Thumbnails are always JPEG; the row's MIME type describes the original asset.
  const headers = mediaHeaders(head, thumbnail ? "image/jpeg" : row.mime_type);
  if (request.method === "HEAD") {
    headers.set("Content-Length", String(head.size));
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = request.headers.get("Range");
  const parsedRange = parseRange(rangeHeader, head.size);
  if (parsedRange === false) {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!parsedRange) {
    const object = await bucket.get(key);
    if (!object) return new Response("Media not found", { status: 404 });
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  }
  // R2 streams the response body without buffering it in Worker memory. Keep
  // HTTP Range semantics exact: an open-ended request means through EOF.
  const range = parsedRange;
  const length = range.end - range.start + 1;
  const object = await bucket.get(key, { range: { offset: range.start, length } });
  if (!object) return new Response("Media not found", { status: 404 });
  headers.set("Content-Length", String(length));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
  return new Response(object.body, { status: 206, headers });
}
