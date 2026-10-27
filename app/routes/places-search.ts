import { env } from "cloudflare:workers";

import type { Route } from "./+types/places-search";
import { listPlaces } from "../data/places.server";
import { placeMatches } from "../utils/places";

/** The search page's «Սրբավայրեր» row: published places whose name or region matches, a few at most. */
export async function loader({ request }: Route.LoaderArgs) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  const found = query.length < 2 ? [] : (await listPlaces(env.DB, { publishedOnly: true })).filter((place) => placeMatches(place, query));
  return Response.json({
    total: found.length,
    places: found.slice(0, 6).map((place) => ({ id: place.id, name: place.name, kind: place.kind, region: place.region, icon: place.icon, cover: place.photos[0] ?? null })),
  }, { headers: { "cache-control": "public, max-age=300" } });
}
