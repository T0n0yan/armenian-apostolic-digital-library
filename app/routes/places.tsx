import { env } from "cloudflare:workers";
import mapCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { Check, MapPin, Send, SlidersHorizontal } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/places";
import { PageHeader, PageShell } from "../components/page-layout";
import { PlacesMap, type MapPlace, type PlacesShown } from "../components/places-map";
import { MAP_ATTRIBUTION } from "../utils/map-style";
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
  const [show, setShow] = useState<PlacesShown>("all");
  // Filters: provinces and kinds ticked (none ticked: all of them).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterBox = useRef<HTMLDivElement>(null);
  // A tap anywhere outside the bar and its panel closes the filters.
  useEffect(() => {
    if (!filtersOpen) return;
    const outside = (event: PointerEvent) => { if (filterBox.current && !filterBox.current.contains(event.target as Node)) setFiltersOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [filtersOpen]);
  const [provinces, setProvinces] = useState<Set<string>>(() => new Set());
  const [kinds, setKinds] = useState<Set<string>>(() => new Set());
  const provinceOf = (place: MapPlace) => place.region.split(", ")[0] || OTHER;
  const allProvinces = useMemo(() => byProvince(places).map(([name]) => name), [places]);
  const allKinds = useMemo(() => Object.keys(PLACE_KINDS).filter((kind) => places.some((place) => place.kind === kind)) as Array<keyof typeof PLACE_KINDS>, [places]);
  const filtered = places.filter((place) => (!provinces.size || provinces.has(provinceOf(place))) && (!kinds.size || kinds.has(place.kind)));
  const shown = filtered.filter((place) => show === "all" || visited.has(place.id) === (show === "visited"));
  // A new Set only when what is shown changes, so the map redraws its markers only then.
  const shownKey = shown.length === places.length ? "" : shown.map((place) => place.id).join(",");
  const only = useMemo(() => (shownKey ? new Set(shownKey.split(",")) : shown.length ? undefined : new Set<string>()), [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleIn = (set: Set<string>, value: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    update(next);
  };
  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={active} onClick={onClick}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${active ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`}>
      <span className={`grid size-4 place-items-center rounded-[5px] border ${active ? "border-gold-bright bg-gold-bright text-[#2a1708]" : "border-current"}`}>{active ? <Check aria-hidden="true" size={11} strokeWidth={3} /> : null}</span>
      {label}
    </button>
  );
  const filterCount = provinces.size + kinds.size;
  // One province open at a time; opening another closes it.
  const [open, setOpen] = useState<string | null>(null);
  // Rows of the province list: Yerevan and the rest («Այլ») alone, the provinces two by two.
  const rows: Array<Array<[string, MapPlace[]]>> = [];
  for (const group of byProvince(filtered)) {
    const last = rows.at(-1);
    const alone = group[0] === YEREVAN || group[0] === OTHER;
    if (!alone && last && last.length === 1 && last[0][0] !== YEREVAN && last[0][0] !== OTHER) last.push(group);
    else rows.push([group]);
  }
  const been = filtered.filter((place) => visited.has(place.id)).length;
  // One segment of the bar above the map: its count and what it shows.
  const segment = (value: PlacesShown, count: number, label: string, color: string) => (
    <button type="button" aria-pressed={show === value} onClick={() => setShow(value)}
      className={`grid min-w-0 flex-1 cursor-pointer place-items-center gap-0 rounded-[12px] border-0 px-1 py-1.5 transition-colors ${show === value ? "bg-[rgb(217_181_111/18%)] shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : "bg-transparent"}`}>
      <strong className={`font-noto text-[17px] leading-tight ${color}`}>{count}</strong>
      <span className="truncate text-[11px] leading-tight text-muted">{label}</span>
    </button>
  );
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Սրբավայրեր" />
      <p className="mx-auto mt-2 mb-4 max-w-[620px] text-center text-[14px] leading-relaxed text-muted">
        Հայաստանի վանքերն ու եկեղեցիները քարտեզի վրա։ Հպեք եկեղեցուն՝ տեղեկության և ճանապարհի համար։
      </p>
      {places.length ? (
        // One bar above the map: all / visited / not yet (each shows just those), and the filters.
        <div ref={filterBox} className="relative z-[1100] mx-auto mb-3 grid w-full max-w-[560px] gap-2">
          <div className="flex items-stretch gap-2">
            <div className="frosted-card flex flex-1 gap-1 p-1" role="group" aria-label="Ցույց տալ քարտեզում">
              {segment("all", filtered.length, "բոլորը", "text-gold-bright")}
              {segment("visited", been, "եղել եմ", "text-[#3f8f5a]")}
              {segment("unvisited", filtered.length - been, "դեռ չեմ եղել", "text-[#b8483e]")}
            </div>
            <button type="button" aria-expanded={filtersOpen} aria-label="Ֆիլտր" onClick={() => setFiltersOpen(!filtersOpen)}
              className={`frosted-card relative grid w-14 shrink-0 cursor-pointer place-items-center text-gold-bright ${filtersOpen ? "shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : ""}`}>
              <SlidersHorizontal aria-hidden="true" size={19} />
              {filterCount ? <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-gold-bright text-[11px] font-bold text-[#2a1708]">{filterCount}</span> : null}
            </button>
          </div>
          {/* Opens over the map (the page doesn't move), fading and sliding in and out. */}
          <div className="places-filters absolute rounded-[20px] top-full right-0 left-0 mt-2 grid gap-3 p-3.5" data-open={filtersOpen} aria-hidden={!filtersOpen} inert={!filtersOpen}>
              <div className="grid gap-2">
                <span className="text-[12px] font-semibold text-faint">Մարզ</span>
                <div className="flex flex-wrap gap-1.5">{allProvinces.map((name) => chip(provinces.has(name), name, () => toggleIn(provinces, name, setProvinces)))}</div>
              </div>
              {allKinds.length > 1 ? (
                <div className="grid gap-2">
                  <span className="text-[12px] font-semibold text-faint">Տեսակ</span>
                  <div className="flex flex-wrap gap-1.5">{allKinds.map((kind) => chip(kinds.has(kind), PLACE_KINDS[kind], () => toggleIn(kinds, kind, setKinds)))}</div>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted">
                <span>Ցույց է տրված՝ {shown.length} / {places.length}</span>
                {filterCount ? <button type="button" className="cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-gold-bright underline" onClick={() => { setProvinces(new Set()); setKinds(new Set()); }}>Մաքրել</button> : <span />}
                <button type="button" className="inline-flex min-h-8 cursor-pointer items-center rounded-full border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-3.5 text-[12.5px] font-bold text-[#2a1708]" onClick={() => setFiltersOpen(false)}>Պատրաստ է</button>
              </div>
            </div>
        </div>
      ) : null}
      <PlacesMap places={places} visited={visited} onToggleVisit={toggle} only={only} fitKey={[...provinces].sort().join("|")} />
      <a className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-[14px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-4 py-2.5 text-[13.5px] font-semibold text-gold-bright no-underline" href="https://t.me/armenian_apostolic_church_bot?start=place" target="_blank" rel="noreferrer">
        <Send aria-hidden="true" size={16} /> Լրացնել քարտեզը բոտի միջոցով
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
      {/* OpenStreetMap's licence asks for its credit: one quiet line at the end of the page. */}
      <p className="mt-6 mb-0 text-center text-[10px] text-faint opacity-60">Քարտեզ՝ {MAP_ATTRIBUTION}</p>
    </PageShell>
  );
}
