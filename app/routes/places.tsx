import { env } from "cloudflare:workers";
import mapCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { MapPin, Send } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/places";
import { PageHeader, PageShell } from "../components/page-layout";
import { PlacesMap, type MapPlace, type PlacesShown } from "../components/places-map";
import { SiteNav } from "../components/site-nav";
import { listPlaces } from "../data/places.server";
import { PLACE_KINDS, placeMediaUrl } from "../utils/places";
import { usePlaceVisits } from "../utils/place-visits";
import { seoMeta } from "../utils/seo";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: mapCss }];

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

const YEREVAN = "Երևան";
const OTHER = "Այլ";

/** Places by province (the region's first part): Yerevan first, the provinces alphabetically, the rest last. */
function byProvince(places: MapPlace[]) {
  const groups = new Map<string, MapPlace[]>();
  for (const place of places) {
    const province = place.region.split(", ")[0] || OTHER;
    groups.set(province, [...(groups.get(province) ?? []), place]);
  }
  const rank = (name: string) => (name === YEREVAN ? 0 : name === OTHER ? 2 : 1);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "hy"));
}

/** One province's places, shown across the whole width under its row. */
function ProvincePlaces({ items }: { items: MapPlace[] }) {
  return (
    <ul className="frosted-card col-span-2 m-0 grid list-none gap-1.5 p-2 min-[560px]:grid-cols-2">
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
  );
}

/** The map of sacred places, and the same places as a list under it. */
export default function Places({ loaderData }: Route.ComponentProps) {
  const { places } = loaderData;
  const { visited, toggle } = usePlaceVisits();
  const been = places.filter((place) => visited.has(place.id)).length;
  const [show, setShow] = useState<PlacesShown>("all");
  // One province open at a time; opening another closes it.
  const [open, setOpen] = useState<string | null>(null);
  // Rows of the province list: Yerevan and the rest («Այլ») alone, the provinces two by two.
  const rows: Array<Array<[string, MapPlace[]]>> = [];
  for (const group of byProvince(places)) {
    const last = rows.at(-1);
    const alone = group[0] === YEREVAN || group[0] === OTHER;
    if (!alone && last && last.length === 1 && last[0][0] !== YEREVAN && last[0][0] !== OTHER) last.push(group);
    else rows.push([group]);
  }
  const tile = (value: PlacesShown, count: number, label: string, color: string) => (
    <button type="button" aria-pressed={show === value} onClick={() => setShow(show === value && value !== "all" ? "all" : value)}
      className={`frosted-card cursor-pointer px-2 py-2.5 text-center transition-shadow ${show === value ? "ring-2 ring-[rgb(217_181_111/70%)]" : ""}`}>
      <strong className={`block font-noto text-[22px] ${color}`}>{count}</strong><span className="text-[12px] text-muted">{label}</span>
    </button>
  );
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Սրբավայրեր" />
      <p className="mx-auto mt-2 mb-4 max-w-[620px] text-center text-[14px] leading-relaxed text-muted">
        Հայաստանի վանքերն ու եկեղեցիները քարտեզի վրա։ Հպեք եկեղեցուն՝ տեղեկության և ճանապարհի համար։
      </p>
      <PlacesMap places={places} visited={visited} onToggleVisit={toggle} show={show} />
      {places.length ? (
        // How much of the map the reader has walked; each count shows just those places on the map.
        <div className="mx-auto mt-3 grid w-full max-w-[480px] grid-cols-3 gap-2" role="group" aria-label="Ցույց տալ քարտեզում">
          {tile("all", places.length, "բոլորը", "text-gold-bright")}
          {tile("visited", been, "եղել եմ", "text-[#3f8f5a]")}
          {tile("unvisited", places.length - been, "դեռ չեմ եղել", "text-[#b8483e]")}
        </div>
      ) : null}
      <a className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-[14px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-4 py-2.5 text-[13.5px] font-semibold text-gold-bright no-underline" href="https://t.me/armenian_apostolic_church_bot?start=place" target="_blank" rel="noreferrer">
        <Send aria-hidden="true" size={16} /> Ուղարկել սրբավայր բոտով
      </a>
      {places.length ? (
        // Provinces two by two; the open one's places fill the row under it.
        <div className="mt-5 grid grid-cols-2 gap-2">
          {rows.map((row) => (
            <Fragment key={row[0][0]}>
              {row.map(([province, items]) => (
                <button key={province} type="button" aria-expanded={open === province} onClick={() => setOpen(open === province ? null : province)}
                  className={`frosted-card flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left text-[14px] font-semibold text-ink ${row.length === 1 ? "col-span-2" : ""} ${open === province ? "ring-2 ring-[rgb(217_181_111/60%)]" : ""}`}>
                  <span className="min-w-0 leading-snug">{province}</span>
                  <span className="shrink-0 text-[12.5px] font-normal text-muted">{items.length} <span className={`inline-block transition-transform ${open === province ? "rotate-90" : ""}`}>›</span></span>
                </button>
              ))}
              {row.some(([province]) => province === open) ? <ProvincePlaces items={row.find(([province]) => province === open)?.[1] ?? []} /> : null}
            </Fragment>
          ))}
        </div>
      ) : <p className="mt-5 text-center text-[13px] text-faint">Քարտեզը դեռ լրացվում է։</p>}
    </PageShell>
  );
}
