import { env } from "cloudflare:workers";

import type { Route } from "./+types/help-media";

type Bindings = { MEDIA: R2Bucket };

/** Օգնության տեսանյութը R2-ից (/help-media/voronum-xxxx.mp4). range-ով, որ կարելի լինի առաջ/ետ տալ։ */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { MEDIA } = env as unknown as Bindings;
  if (!/^[a-z0-9.-]{1,100}$/u.test(params.file)) return new Response(null, { status: 404 });
  const range = request.headers.get("range");
  const object = await MEDIA.get(`help/${params.file}`, range ? { range: request.headers } : undefined);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  // Անունը փոխվում է ամեն նոր վերբեռնման հետ, ուստի կարելի է երկար պահել
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (range && "range" in object && object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
