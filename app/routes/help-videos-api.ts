import { env } from "cloudflare:workers";

import type { Route } from "./+types/help-videos-api";
import { readHelpConfig } from "../data/help-videos.server";
import { helpVideoList } from "../utils/help-videos";

/** Առաջին այցի ուղեցույցի համար. միայն երբ միացված է ադմինում, միայն վերբեռնվածները։ */
export async function loader({}: Route.LoaderArgs) {
  const config = await readHelpConfig(env.DB);
  const videos = config.onboarding ? helpVideoList(config).filter((video) => video.url) : [];
  return Response.json({ onboarding: config.onboarding && videos.length > 0, videos }, { headers: { "cache-control": "public, max-age=300" } });
}
