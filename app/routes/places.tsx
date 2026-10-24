import { env } from "cloudflare:workers";
import leafletCss from "leaflet/dist/leaflet.css?url";
import { MapPin, Send } from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/places";
import { PageHeader, PageShell } from "../components/page-layout";
import { PlacesMap, type MapPlace } from "../components/places-map";
import { SiteNav } from "../components/site-nav";
import { listPlaces } from "../data/places.server";
import { PLACE_KINDS, placeMediaUrl } from "../utils/places";
import { seoMeta } from "../utils/seo";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: leafletCss }];

export function meta({ loaderData }: Route.MetaArgs) {
  return seoMeta({
    origin: loaderData?.origin,
    title: "Սրբավայրեր — Հոգևոր ժառանգություն",
    description: "Հայաստանի վանքերը, եկեղեցիները, մատուռներն ու սրբավայրերը քարտեզի վրա՝ նկարներով, պատմությամբ և ճանապարհով։",
    path: "/places",
  });
}

/** The popup's few lines: the story cut at a word. */
function summary(text: string) {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 160).replace(/\s+\S*$/u, "")}…`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const places = await listPlaces(env.DB, { publishedOnly: true });
  return {
    origin: new URL(request.url).origin,
    places: places.map((place): MapPlace => ({
      id: place.id, name: place.name, kind: place.kind, latitude: place.latitude, longitude: place.longitude, region: place.region,
      summary: summary(place.description),
      icon: place.icon, cover: place.photos[0] ?? null, verified: place.verified,
    })),
  };
}

/** Places by province (the region's first part), provinces and places in alphabetical order. */
function byProvince(places: MapPlace[]) {
  const groups = new Map<string, MapPlace[]>();
  for (const place of places) {
    const province = place.region.split(", ")[0] || "Այլ";
    groups.set(province, [...(groups.get(province) ?? []), place]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "hy"));
}

/** The map of sacred places, and the same places as a list under it. */
export default function Places({ loaderData }: Route.ComponentProps) {
  const { places } = loaderData;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Սրբավայրեր" />
      <p className="mx-auto mt-2 mb-4 max-w-[620px] text-center text-[14px] leading-relaxed text-muted">
        Հայաստանի վանքերն ու եկեղեցիները քարտեզի վրա։ Հպեք եկեղեցուն՝ տեղեկության և ճանապարհի համար։
      </p>
      <PlacesMap places={places} />
      <a className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-[14px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-4 py-2.5 text-[13.5px] font-semibold text-gold-bright no-underline" href="https://t.me/armenian_apostolic_church_bot?start=place" target="_blank" rel="noreferrer">
        <Send aria-hidden="true" size={16} /> Ուղարկել սրբավայր (բոտով, անանուն)
      </a>
      {places.length ? (
        // Grouped by province, each folded, so hundreds of places don't make an endless page.
        <div className="mt-5 grid gap-2">
          {byProvince(places).map(([province, items]) => (
            <details key={province} className="frosted-card group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14.5px] font-semibold text-ink">
                <span>{province}</span>
                <span className="text-[12.5px] font-normal text-muted">{items.length} <span className="inline-block transition-transform group-open:rotate-90">›</span></span>
              </summary>
              <ul className="m-0 grid list-none gap-1.5 px-2 pb-2 min-[560px]:grid-cols-2">
                {items.map((place) => (
                  <li key={place.id}>
                    <Link className="flex items-center gap-3 rounded-[12px] p-2 text-inherit no-underline hover:bg-subtle" to={`/places/${place.id}`}>
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#efe3c8]">
                        {place.icon ? <img className="size-10 object-contain" src={placeMediaUrl(place.icon)} alt="" loading="lazy" /> : place.cover ? <img className="size-full object-cover" src={placeMediaUrl(place.cover)} alt="" loading="lazy" /> : <MapPin aria-hidden="true" size={18} className="text-[#a06d22]" />}
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <strong className="truncate font-noto text-[14px] text-ink">{place.name}</strong>
                        <span className="truncate text-[12px] text-muted">{PLACE_KINDS[place.kind]}{place.region.includes(", ") ? ` · ${place.region.split(", ").slice(1).join(", ")}` : ""}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : <p className="mt-5 text-center text-[13px] text-faint">Քարտեզը դեռ լրացվում է։</p>}
    </PageShell>
  );
}
