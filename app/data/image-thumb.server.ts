/** Ցանկի քարտերի և նյութի էջի նկարի լայնությունը (հեռախոսի 2x էկրանին բավական է)։ */
export const CARD_IMAGE_WIDTH = 800;

const THUMB_HEADERS = { "content-type": "image/webp", "x-content-type-options": "nosniff" };

/**
 * Փոքրացված WebP պատկերը R2-ից (`thumbs/<բանալի>-w<լայնություն>.webp`). չկա՝ պատրաստում է
 * Cloudflare Images-ով (Worker-ի CPU-ն չի ծախսվում) և պահում R2-ում, որ ամեն նկար փոխարկվի մեկ
 * անգամ, ոչ թե ամեն հարցման ժամանակ։ `version`-ը տրվում է, երբ բնօրինակը կարող է փոխվել նույն
 * բանալիով (հղման քարտերը)։ Ցանկացած ձախողման դեպքում՝ null, կանչողը տալիս է բնօրինակը։
 */
export async function storedThumb(
  media: R2Bucket,
  images: ImagesBinding | undefined,
  key: string,
  width: number,
  options: { version?: string; cacheControl?: string } = {},
) {
  const version = options.version?.replace(/[^a-z0-9]/giu, "").slice(0, 16);
  const thumbKey = `thumbs/${key.replace(/\.[a-z0-9]+$/iu, "")}${version ? `-${version}` : ""}-w${width}.webp`;
  const headers = { ...THUMB_HEADERS, "cache-control": options.cacheControl ?? "public, max-age=604800" };
  const stored = await media.get(thumbKey);
  if (stored) {
    const found = new Headers({ ...headers, "content-length": String(stored.size) });
    if (stored.httpEtag) found.set("etag", stored.httpEtag);
    return new Response(stored.body, { headers: found });
  }
  if (!images) return null;
  const original = await media.get(key);
  if (!original || !(original.httpMetadata?.contentType ?? "image/").startsWith("image/")) return null;
  const result = await images.input(original.body).transform({ width, fit: "scale-down" }).output({ format: "image/webp", quality: 80 });
  const bytes = await result.response().arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength >= original.size) return null;
  await media.put(thumbKey, bytes, { httpMetadata: { contentType: "image/webp" } });
  return new Response(bytes, { headers });
}

/** `?w=`-ի արժեքը, եթե այն թույլատրված լայնություններից է։ */
export function requestedWidth(request: Request, allowed: ReadonlySet<number>) {
  const width = Number(new URL(request.url).searchParams.get("w"));
  return allowed.has(width) ? width : null;
}
