import { useEffect, useRef } from "react";

import { directionLinks, PLACE_KINDS, placeMediaUrl, type PlaceKind } from "../utils/places";

export type MapPlace = {
  id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; region: string;
  summary: string; icon: string | null; cover: string | null; verified: boolean;
};

const escape = (text: string) => text.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);

/** The marker: the church's drawing when there is one, else its cover photo in a gold ring. */
function markerHtml(place: MapPlace) {
  if (place.icon) return `<img class="place-pin-drawing" src="${placeMediaUrl(place.icon)}" alt="" draggable="false">`;
  if (place.cover) return `<span class="place-pin-photo"><img src="${placeMediaUrl(place.cover)}" alt="" draggable="false"></span>`;
  return `<span class="place-pin-dot">✠</span>`;
}

function popupHtml(place: MapPlace) {
  const links = directionLinks(place.latitude, place.longitude)
    .map((link) => `<a class="place-popup-route" href="${link.href}" target="_blank" rel="noreferrer">${escape(link.label)}</a>`).join("");
  return `<div class="place-popup">
    ${place.cover ? `<img class="place-popup-cover" src="${placeMediaUrl(place.cover)}" alt="">` : ""}
    <div class="place-popup-body">
      <strong>${escape(place.name)}</strong>
      <span class="place-popup-meta">${escape(PLACE_KINDS[place.kind])}${place.region ? ` · ${escape(place.region)}` : ""}${place.verified ? "" : " · ⚑ Ճշտել"}</span>
      ${place.summary ? `<p>${escape(place.summary)}</p>` : ""}
      <a class="place-popup-more" href="/places/${place.id}">Մանրամասն →</a>
      <span class="place-popup-routes">Ինչպես հասնել՝ ${links}</span>
    </div>
  </div>`;
}

/**
 * Armenia with every published place on it (Leaflet over OpenStreetMap, toned to the site's
 * parchment). Leaflet needs a browser, so it is loaded once the page is on screen.
 */
export function PlacesMap({ places, focus }: { places: MapPlace[]; focus?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then(({ default: L }) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, {
        center: [40.25, 44.85], zoom: 8, minZoom: 6, maxZoom: 18, zoomControl: true, attributionControl: true,
        maxBounds: L.latLngBounds([37.5, 41.5], [42.5, 48.5]), maxBoundsViscosity: 0.8,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, className: "parchment-tiles",
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      const markers = places.map((place) => {
        const size: [number, number] = place.icon ? [64, 64] : [46, 46];
        const marker = L.marker([place.latitude, place.longitude], {
          title: place.name, alt: place.name, riseOnHover: true,
          icon: L.divIcon({ className: "place-pin", html: markerHtml(place), iconSize: size, iconAnchor: place.icon ? [32, 60] : [23, 23], popupAnchor: [0, place.icon ? -54 : -20] }),
        }).bindPopup(popupHtml(place), { maxWidth: 280, minWidth: 220, className: "place-popup-shell" }).addTo(map!);
        if (place.id === focus) marker.openPopup();
        return marker;
      });
      // Bigger drawings as the map comes closer.
      const scale = () => container.current?.style.setProperty("--pin-scale", String(Math.min(1.6, Math.max(0.7, 0.7 + ((map?.getZoom() ?? 8) - 7) * 0.18))));
      map.on("zoomend", scale);
      scale();
      if (focus) {
        const place = places.find((item) => item.id === focus);
        if (place) map.setView([place.latitude, place.longitude], 13);
      } else if (markers.length > 1) {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25), { maxZoom: 10 });
      }
    });
    return () => { cancelled = true; map?.remove(); };
  }, [places, focus]);
  return <div ref={container} className="places-map" role="region" aria-label="Սրբավայրերի քարտեզ" />;
}
