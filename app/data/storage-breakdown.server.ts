export type StorageGroup = { prefix: string; files: number; bytes: number };
export type StorageKind = "video" | "audio" | "image" | "other";
export type StorageBreakdown = {
  groups: StorageGroup[]; files: number; bytes: number; complete: boolean;
  /** Telegram-ի մեդիան (v1/) ըստ տեսակի։ */
  kinds: Array<{ kind: StorageKind; files: number; bytes: number }>;
  /** Ամենամեծ ֆայլերը և այն նյութը, որին պատկանում են։ */
  largest: Array<{ key: string; bytes: number; materialId: string | null }>;
};

/** Թղթապանակի առաջին մասը. «library/123/photo.jpg» → «library»։ */
export function topPrefix(key: string) {
  const slash = key.indexOf("/");
  return slash === -1 ? "(արմատ)" : key.slice(0, slash);
}

/** Ֆայլի տեսակը՝ վերջավորությունից։ */
export function kindOf(key: string): StorageKind {
  const extension = /\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv"].includes(extension)) return "video";
  if (["mp3", "m4a", "ogg", "oga", "opus", "wav", "aac"].includes(extension)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "image";
  return "other";
}

/** «v1/-1002993860753/277/…» → նյութի id «material_tg_n1002993860753_277»։ */
export function materialIdOf(key: string) {
  const match = /^(?:v1|attachments)\/(-?)(\d+)\/(\d+)\//.exec(key);
  return match ? `material_tg_${match[1] ? "n" : "p"}${match[2]}_${match[3]}` : null;
}

/**
 * Պահեստի (R2) բաժանումն ըստ թղթապանակների՝ ինչն է որքան տեղ զբաղեցնում։
 * Առավելագույնը 30 էջ (30 000 ֆայլ), որ էջը արագ բացվի. ավելի շատի դեպքում complete=false։
 */
export async function readStorageBreakdown(bucket: R2Bucket, maxPages = 30): Promise<StorageBreakdown> {
  const groups = new Map<string, StorageGroup>();
  const kinds = new Map<StorageKind, { kind: StorageKind; files: number; bytes: number }>();
  const all: Array<{ key: string; bytes: number }> = [];
  let cursor: string | undefined;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const listing = await bucket.list({ cursor, limit: 1000 });
    for (const object of listing.objects) {
      const prefix = topPrefix(object.key);
      const group = groups.get(prefix) ?? { prefix, files: 0, bytes: 0 };
      group.files += 1; group.bytes += object.size;
      groups.set(prefix, group);
      all.push({ key: object.key, bytes: object.size });
      if (prefix === "v1") {
        const kind = kindOf(object.key);
        const item = kinds.get(kind) ?? { kind, files: 0, bytes: 0 };
        item.files += 1; item.bytes += object.size;
        kinds.set(kind, item);
      }
    }
    if (!listing.truncated) { complete = true; break; }
    cursor = listing.cursor;
  }
  const list = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
  const largest = all.sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((item) => ({ ...item, materialId: materialIdOf(item.key) }));
  return { kinds: [...kinds.values()].sort((a, b) => b.bytes - a.bytes), largest, groups: list, files: list.reduce((sum, group) => sum + group.files, 0), bytes: list.reduce((sum, group) => sum + group.bytes, 0), complete };
}
