let lastCleanupAt = 0;

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function queryHash(normalizedQuery: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(normalizedQuery))));
}

export async function recordSearchAggregate(
  database: D1Database,
  normalizedQuery: string,
  categoryId: string,
  resultCount: number,
  hmacSecret: string,
) {
  if (!normalizedQuery || !hmacSecret) return;
  const now = new Date();
  const bucketDate = now.toISOString().slice(0, 10);
  const scopeKey = categoryId || "global";
  const hash = await queryHash(normalizedQuery, hmacSecret);
  await database.prepare(
    `INSERT INTO search_query_aggregates (
       query_hash, query_length, scope_key, bucket_date, query_count,
       zero_result_count, result_count_total, last_searched_at
     ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(query_hash, scope_key, bucket_date) DO UPDATE SET
       query_count = query_count + 1,
       zero_result_count = zero_result_count + excluded.zero_result_count,
       result_count_total = result_count_total + excluded.result_count_total,
       last_searched_at = excluded.last_searched_at`,
  ).bind(
    hash,
    Array.from(normalizedQuery).length,
    scopeKey,
    bucketDate,
    resultCount === 0 ? 1 : 0,
    Math.max(0, resultCount),
    now.toISOString(),
  ).run();

  if (Date.now() - lastCleanupAt > 60 * 60_000) {
    lastCleanupAt = Date.now();
    await database.prepare(
      "DELETE FROM search_query_aggregates WHERE bucket_date < date('now', '-90 days')",
    ).run();
  }
}
