// Mini App-ի story-ի ժամանակավոր նկարները R2-ում (app/routes/story-upload.ts)։

/** Ջնջում է 2 օրից հին story-ի նկարները։ */
export async function removeOldStories(bucket: R2Bucket) {
  const limit = Date.now() - 2 * 86_400_000;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: "stories/", cursor, limit: 500 });
    const old = page.objects.filter((object) => object.uploaded.getTime() < limit).map((object) => object.key);
    if (old.length) await bucket.delete(old);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
