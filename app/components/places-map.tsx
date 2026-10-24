import { ChevronRight, MapPin, Navigation, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { ARMENIA_BORDER, ARMENIA_BOUNDS } from "../utils/armenia-border";
import { directionLinks, PLACE_KINDS, placeMediaUrl, type PlaceKind } from "../utils/places";

export type MapPlace = {
  id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; region: string;
  summary: string; icon: string | null; cover: string | null; verified: boolean;
};

/** The marker: the church's drawing when there is one, else its cover photo in a gold ring. */
function markerHtml(place: MapPlace) {
  if (place.icon) return `<img class="place-pin-drawing" src="${placeMediaUrl(place.icon)}" alt="" draggable="false">`;
  if (place.cover) return `<span class="place-pin-photo"><img src="${placeMediaUrl(place.cover)}" alt="" draggable="false"></span>`;
  return `<span class="place-pin-dot">✠</span>`;
}

/** The card that slides up inside the map when a church is tapped: never cut by the map's edge. */
function PlaceCard({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const picture = place.cover ? placeMediaUrl(place.cover) : place.icon ? placeMediaUrl(place.icon) : null;
  return (
    <div className="place-card" role="dialog" aria-label={place.name}>
      <button className="place-card-close" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={16} /></button>
      <div className="flex gap-3">
        <span className={`grid size-[60px] shrink-0 place-items-center overflow-hidden rounded-[14px] ${place.cover ? "" : "bg-[#efe3c8]"}`}>
          {picture ? <img className={place.cover ? "size-full object-cover" : "size-[54px] object-contain"} src={picture} alt="" /> : <MapPin aria-hidden="true" size={22} className="text-[#a06d22]" />}
        </span>
        <div className="grid min-w-0 content-start gap-0.5 pr-7">
          <strong className="truncate font-noto text-[15px] leading-snug text-ink">{place.name}</strong>
          <span className="line-clamp-2 text-[11.5px] leading-snug text-muted">{PLACE_KINDS[place.kind]}{place.region ? ` · ${place.region}` : ""}{place.verified ? "" : " · ⚑ Ճշտել"}</span>
          {place.summary ? <p className="m-0 mt-0.5 line-clamp-1 text-[12.5px] leading-snug text-muted">{place.summary}</p> : null}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <Link className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-[11px] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-3 text-[13px] font-bold text-[#2a1708] no-underline" to={`/places/${place.id}`}>
          Մանրամասն <ChevronRight aria-hidden="true" size={15} />
        </Link>
        {directionLinks(place.latitude, place.longitude).map((link) => (
          <a key={link.href} className="inline-flex min-h-9 items-center gap-1 rounded-[11px] border border-glass-border bg-subtle px-2.5 text-[12.5px] font-semibold text-gold-bright no-underline" href={link.href} target="_blank" rel="noreferrer" aria-label={`Ճանապարհ՝ ${link.label}`}>
            <Navigation aria-hidden="true" size={13} /> {link.label.replace(" Maps", "")}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Armenia alone (Leaflet over OpenStreetMap, toned to the site's parchment; the rest of the world
 * covered), with every published place drawn on it. Tapping a church opens its card. Leaflet needs a
 * browser, so it is loaded once the page is on screen. With `focus`, the map shows that one place
 * up close (a place's own page) and its marker opens nothing.
 */
export function PlacesMap({ places, focus }: { places: MapPlace[]; focus?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then(async ({ default: L }) => {
      // The clustering plugin attaches itself to the global L.
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (cancelled || !container.current) return;
      const armenia = L.latLngBounds(ARMENIA_BOUNDS);
      map = L.map(container.current, {
        zoomControl: true, attributionControl: false, maxZoom: 18, zoomSnap: 0.25,
        maxBounds: armenia.pad(0.08), maxBoundsViscosity: 1,
      });
      map.fitBounds(armenia, { padding: [8, 8] });
      // Never further out than all of Armenia.
      map.setMinZoom(map.getBoundsZoom(armenia, false, L.point(16, 16)));
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, className: "parchment-tiles",
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      // Only Armenia: the rest of the world is covered with plain parchment, the border drawn in gold.
      L.polygon([[[-85, -180], [85, -180], [85, 180], [-85, 180]], ...ARMENIA_BORDER], {
        stroke: false, fillColor: "#efe3c8", fillOpacity: 1, interactive: false,
      }).addTo(map);
      L.polygon(ARMENIA_BORDER, { color: "#b07d2e", weight: 2, opacity: 0.85, fill: false, interactive: false }).addTo(map);
      // Nearby places gather into one gold count until the map comes close (hundreds from OSM).
      const layer = focus ? L.layerGroup() : L.markerClusterGroup({
        maxClusterRadius: 48, disableClusteringAtZoom: 13, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? 38 : count < 50 ? 46 : 54;
          return L.divIcon({ className: "place-cluster", html: `<span>${count}</span>`, iconSize: [size, size] });
        },
      });
      layer.addTo(map);
      for (const place of places) {
        const marker = L.marker([place.latitude, place.longitude], {
          title: place.name, alt: place.name, riseOnHover: true, keyboard: !focus, interactive: !focus,
          icon: L.divIcon({ className: "place-pin", html: markerHtml(place), iconSize: place.icon ? [64, 64] : [46, 46], iconAnchor: place.icon ? [32, 60] : [23, 23] }),
        });
        layer.addLayer(marker);
        if (!focus) marker.on("click", () => setSelected(place.id));
      }
      if (!focus) map.on("click", () => setSelected(null));
      // Bigger drawings as the map comes closer.
      const scale = () => container.current?.style.setProperty("--pin-scale", String(Math.min(1.6, Math.max(0.7, 0.7 + ((map?.getZoom() ?? 8) - 7) * 0.18))));
      map.on("zoomend", scale);
      const place = focus ? places.find((item) => item.id === focus) : null;
      if (place) map.setView([place.latitude, place.longitude], 13);
      scale();
    });
    return () => { cancelled = true; map?.remove(); };
  }, [places, focus]);
  const current = places.find((place) => place.id === selected);
  return (
    <div className={`places-map-frame ${focus ? "places-map-frame--small" : ""}`}>
      <div ref={container} className="places-map" role="region" aria-label="Սրբավայրերի քարտեզ" />
      {current ? <PlaceCard key={current.id} place={current} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
