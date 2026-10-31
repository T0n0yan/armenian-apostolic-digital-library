import { env } from "cloudflare:workers";

import type { Route } from "./+types/glossary-api";
import { listGlossary } from "../data/glossary.server";

/** Բառարանը բոլոր էջերի համար (մեկ անգամ է բեռնվում, պահվում է քեշում)։ */
export async function loader(_: Route.LoaderArgs) {
  const terms = await listGlossary(env.DB);
  return Response.json({ terms }, { headers: { "cache-control": "public, max-age=300" } });
}
