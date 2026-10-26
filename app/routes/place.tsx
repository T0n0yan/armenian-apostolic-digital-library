import { env } from "cloudflare:workers";
import mapCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { Navigation } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/place";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { PlacesMap, VisitButton } from "../components/places-map";
import { usePlaceVisits } from "../utils/place-visits";
import { SiteNav } from "../components/site-nav";
import { getPlace } from "../data/places.server";
import { ACTIVE_LABELS, directionLinks, PLACE_KINDS, placeMediaUrl } from "../utils/places";
import { seoMeta } from "../utils/seo";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: mapCss }];

export async function loader({ params, request }: Route.LoaderArgs) {
  const place = await getPlace(env.DB, params.id);
  if (!place?.published) throw new Response("Not found", { status: 404 });
  return { place, origin: new URL(request.url).origin };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Սրբավայր — Հոգևոր ժառանգություն" }];
  const { place, origin } = loaderData;
  const cover = place.photos[0];
  return seoMeta({
    title: `${place.name} — Սրբավայրեր | Հոգևոր ժառանգություն`,
    description: place.description.replace(/\s+/gu, " ").slice(0, 160) || `${PLACE_KINDS[place.kind]}${place.region ? `, ${place.region}` : ""}`,
    path: `/places/${place.id}`,
    origin,
    ...(cover ? { image: `${origin}${placeMediaUrl(cover)}` } : {}),
  });
}

/** A YouTube link as an embeddable address (privacy-enhanced), or null for anything else. */
function youtubeEmbed(url: string) {
  const id = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/u.exec(url)?.[1];
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

const panel = "frosted-panel grid gap-2.5 px-5 py-4 text-[14.5px] leading-[1.75] text-ink";
const heading = "m-0 font-noto text-[17px] font-semibold text-gold-bright";

/** One church or shrine: its photos, story, clergy, services, video and the way there. */
export default function PlacePage({ loaderData }: Route.ComponentProps) {
  const { place } = loaderData;
  const video = place.videoUrl.startsWith("places/") ? placeMediaUrl(place.videoUrl) : null;
  const embed = video ? null : youtubeEmbed(place.videoUrl);
  const { visited, toggle } = usePlaceVisits();
  // One array per place, so the small map is drawn once and not again on every render.
  const pin = useMemo(() => [{ id: place.id, name: place.name, kind: place.kind, latitude: place.latitude, longitude: place.longitude, region: place.region, summary: "", icon: place.icon, cover: place.photos[0] ?? null, verified: place.verified }], [place]);
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/places" backLabel="Սրբավայրեր" title={place.name} />
      <p className="mt-1 mb-4 text-center text-[13px] text-muted">{PLACE_KINDS[place.kind]}{ACTIVE_LABELS[place.active] ? ` · ${ACTIVE_LABELS[place.active]}` : ""}{place.region ? ` · ${place.region}` : ""}</p>
      <article className="grid gap-4">
        {place.photos.length ? (
          <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1">
            {place.photos.map((key, index) => (
              <img key={key} className={`aspect-[4/3] shrink-0 snap-center rounded-[18px] object-cover shadow-card ${place.photos.length === 1 ? "mx-auto w-full max-w-[720px]" : "w-[86%] max-w-[560px] min-[560px]:w-[70%]"}`} src={placeMediaUrl(key)} alt={index === 0 ? place.name : ""} loading={index === 0 ? "eager" : "lazy"} />
            ))}
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-[420px]"><VisitButton visited={visited.has(place.id)} onToggle={() => toggle(place.id)} /></div>
        {!place.verified ? (
          <p className="m-0 rounded-[14px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-4 py-2.5 text-[13px] text-muted">⚑ Ճշտել. տեղեկությունը ուղարկել են մեր ընթերցողները, և այն դեռ ստուգվում է հոգևորականների կողմից։</p>
        ) : null}
        {place.description ? <section className={panel}><h2 className={heading}>Պատմություն</h2><p className="m-0 whitespace-pre-line">{place.description}</p></section> : null}
        {place.liturgy || place.services ? (
          <section className={panel}>
            <h2 className={heading}>Արարողություններ</h2>
            {place.liturgy ? <p className="m-0 whitespace-pre-line"><strong className="font-semibold">Սուրբ Պատարագ՝ </strong>{place.liturgy}</p> : null}
            {place.services ? <p className="m-0 whitespace-pre-line"><strong className="font-semibold">Ժամերգություններ՝ </strong>{place.services}</p> : null}
          </section>
        ) : null}
        {place.clergy ? <section className={panel}><h2 className={heading}>Ծառայողներ</h2><p className="m-0 whitespace-pre-line">{place.clergy}</p></section> : null}
        {place.openHours || place.accessibility ? (
          <section className={panel}>
            <h2 className={heading}>Այցելություն</h2>
            {place.openHours ? <p className="m-0 whitespace-pre-line"><strong className="font-semibold">Բաց է՝ </strong>{place.openHours}</p> : null}
            {place.accessibility ? <p className="m-0 whitespace-pre-line"><strong className="font-semibold">Ճանապարհը և մուտքը՝ </strong>{place.accessibility}</p> : null}
          </section>
        ) : null}
        {video ? <video className="w-full rounded-[18px] bg-black" src={video} controls preload="metadata" playsInline /> : null}
        {embed ? <iframe className="aspect-video w-full rounded-[18px] border-0" src={embed} title={place.name} allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" /> : null}
        {!video && !embed && place.videoUrl ? <a className="text-gold-bright" href={place.videoUrl} target="_blank" rel="noreferrer">Դիտել տեսանյութը →</a> : null}
        <section className={panel}>
          <h2 className={heading}>Ինչպես հասնել</h2>
          <div className="flex flex-wrap gap-2">
            {directionLinks(place.latitude, place.longitude).map((link) => (
              <a key={link.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-[12px] border border-glass-border bg-subtle px-3 text-[13.5px] font-semibold text-gold-bright no-underline" href={link.href} target="_blank" rel="noreferrer">
                <Navigation aria-hidden="true" size={15} /> {link.label}
              </a>
            ))}
          </div>
          <PlacesMap places={pin} focus={place.id} visited={visited} />
        </section>
        {place.fromOsm ? <p className="m-0 text-center text-[12px] text-faint">Տեղը և անունը՝ <a className="text-faint underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-ի մասնակիցներ։</p> : null}
        {place.creditName.trim() ? <p className="m-0 text-center text-[12.5px] text-faint">Նկարներն ու տեղեկությունը ուղարկեց՝ {place.creditName.trim()}։ Շնորհակալություն 🙏</p> : null}
        <Link className="mx-auto text-[13.5px] text-gold-bright" to="/places">← Բոլոր սրբավայրերը քարտեզում</Link>
      </article>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} notFoundTitle="Այս սրբավայրը չի գտնվել" />;
}
