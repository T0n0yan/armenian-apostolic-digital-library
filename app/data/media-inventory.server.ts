/** A bounded, read-only inventory page. It deliberately has no delete operation. */
export async function mediaInventoryPage(bucket: R2Bucket, database: D1Database, cursor?: string) {
  const page = await bucket.list({ limit: 100, ...(cursor ? { cursor } : {}) });
  // Each comparison uses an existing UNIQUE index. Never scan the entire catalogue per page.
  const keys = page.objects.filter((object) => object.key.startsWith("v1/")).map((object) => object.key);
  const { results } = await database.prepare(`SELECT value AS key FROM json_each(?) AS candidate
    WHERE EXISTS (SELECT 1 FROM library_media WHERE r2_key = candidate.value)
      OR EXISTS (SELECT 1 FROM library_media WHERE thumbnail_r2_key = candidate.value)
      OR EXISTS (SELECT 1 FROM material_attachments WHERE r2_key = candidate.value)`)
    .bind(JSON.stringify(keys)).all<{ key: string }>();
  const references = new Set(results.map((row) => row.key));
  const cutoff = Date.now() - 14 * 86_400_000;
  return {
    scanned: page.objects.length, bytes: page.objects.reduce((n, object) => n + object.size, 0),
    // Only unreferenced library v1 objects are candidates; places, indexes and OGs are excluded.
    candidates: page.objects.filter((object) => object.key.startsWith("v1/") && !references.has(object.key) && object.uploaded.getTime() < cutoff)
      .map((object) => ({ key: object.key, bytes: object.size, uploaded: object.uploaded.toISOString() })),
    next: page.truncated ? page.cursor : null,
  };
}
