import { env } from "cloudflare:workers";

import type { Route } from "./+types/church-icon-upload";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { getPlace, storePlaceFile } from "../data/places.server";

// 3D խմբագրիչ՝ սրբապատկերի նկարի վերբեռնում (բրաուզերում արդեն WebP է դարձել)։ Պահվում է սրբավայրի
// թղթապանակում R2-ում և երևում է /place-media/...-ով (չհրապարակված սրբավայրինը՝ միայն ադմիններին)։
export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);
  await requirePermission(request, env.DB, "places");
  const form = await request.formData();
  const place = await getPlace(env.DB, String(form.get("place") ?? ""));
  if (!place) return Response.json({ error: "Սրբավայրը չի գտնվել" }, { status: 404 });
  const file = form.get("file");
  if (!(file instanceof File) || !["image/webp", "image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Նկարը պետք է լինի WebP/JPEG/PNG, մինչև 5 ՄԲ" }, { status: 400 });
  }
  const { MEDIA } = env as unknown as { MEDIA: R2Bucket };
  const key = await storePlaceFile(MEDIA, place.id, "icon3d", await file.arrayBuffer(), file.type);
  return Response.json({ url: `/place-media/${place.id}/${key.split("/").pop()}` });
}
