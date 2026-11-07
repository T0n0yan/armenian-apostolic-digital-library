import { env } from "cloudflare:workers";

import type { Route } from "./+types/story-image";

// Mini App-ի story-ի ժամանակավոր նկարը (տես story-upload.ts)։
export async function loader({ params }: Route.LoaderArgs) {
  if (!/^[0-9a-f]{32}\.jpg$/u.test(params.file)) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(`stories/${params.file}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": `inline; filename="apostolic-am-${params.file}"`,
    },
  });
}
