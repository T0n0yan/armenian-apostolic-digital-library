import { env } from "cloudflare:workers";

import type { Route } from "./+types/church-points";
import { listPublicPlaceSummaries } from "../data/places.server";

/**
 * Հրապարակված եկեղեցիների անունները և կոորդինատները։ Բրաուզերը ինքն է հաշվում, թե որն է մոտ
 * (մարդու դիրքը կայք չի ուղարկվում)։ Օգտագործում է «Դուք ունեք հարց, մոտակայքում կա եկեղեցի» հուշումը։
 */
export async function loader(_: Route.LoaderArgs) {
  const places = await listPublicPlaceSummaries(env.DB);
  return Response.json(
    { places: places.map((place) => ({ id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude })) },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
