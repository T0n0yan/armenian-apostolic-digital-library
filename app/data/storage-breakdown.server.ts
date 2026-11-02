export type StorageGroup = { prefix: string; files: number; bytes: number };
export type StorageBreakdown = { groups: StorageGroup[]; files: number; bytes: number; complete: boolean };

/** Թղթապանակի առաջին մասը. «library/123/photo.jpg» → «library»։ */
export function topPrefix(key: string) {
  const slash = key.indexOf("/");
  return slash === -1 ? "(արմատ)" : key.slice(0, slash);
}

/**
 * Պահեստի (R2) բաժանումն ըստ թղթապանակների՝ ինչն է որքան տեղ զբաղեցնում։
 * Առավելագույնը 30 էջ (30 000 ֆայլ), որ էջը արագ բացվի. ավելի շատի դեպքում complete=false։
 */
export async function readStorageBreakdown(bucket: R2Bucket, maxPages = 30): Promise<StorageBreakdown> {
  const groups = new Map<string, StorageGroup>();
  let cursor: string | undefined;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const listing = await bucket.list({ cursor, limit: 1000 });
    for (const object of listing.objects) {
      const prefix = topPrefix(object.key);
      const group = groups.get(prefix) ?? { prefix, files: 0, bytes: 0 };
      group.files += 1; group.bytes += object.size;
      groups.set(prefix, group);
    }
    if (!listing.truncated) { complete = true; break; }
    cursor = listing.cursor;
  }
  const list = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
  return { groups: list, files: list.reduce((sum, group) => sum + group.files, 0), bytes: list.reduce((sum, group) => sum + group.bytes, 0), complete };
}
