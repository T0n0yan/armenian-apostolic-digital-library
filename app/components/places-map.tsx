import { Check, ChevronRight, MapPin, Minus, Navigation, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { ARMENIA_BORDER, ARMENIA_BOUNDS } from "../utils/armenia-border";
import { ArmeniaOutline } from "./armenia-outline";
import { MAP_PALETTES, mapStyle, type MapTheme } from "../utils/map-style";
import { circleRing, directionLinks, PLACE_KINDS, placeMediaUrl, type PlaceKind } from "../utils/places";

export type MapPlace = {
  id: string; name: string; kind: PlaceKind; latitude: number; longitude: number; region: string;
  summary: string; icon: string | null; cover: string | null; verified: boolean;
};

type MapLibre = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;

const currentTheme = (): MapTheme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** The card that slides up over the map when a church is tapped. */
function PlaceCard({ place, onClose, visited, onToggleVisit, closing }: { place: MapPlace; onClose: () => void; visited: boolean; onToggleVisit: () => void; closing: boolean }) {
  const picture = place.cover ? placeMediaUrl(place.cover) : place.icon ? placeMediaUrl(place.icon) : null;
  return (
    <div className={`place-card${closing ? " place-card-closing" : ""}`} role="dialog" aria-label={place.name}>
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
      <VisitButton visited={visited} onToggle={onToggleVisit} />
      <div className="mt-2 flex items-center gap-1.5">
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

/** «Եղել եմ»: green when the reader has been there, an invitation in red when not yet. */
export function VisitButton({ visited, onToggle }: { visited: boolean; onToggle: () => void }) {
  // A quiet checkbox: an empty ring until the reader marks it, then a green tick.
  return (
    <button type="button" onClick={onToggle} aria-pressed={visited}
      className={`mt-2.5 inline-flex min-h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] border text-[13px] font-semibold transition-colors ${visited ? "border-[rgb(63_143_90/45%)] bg-[rgb(63_143_90/12%)] text-[#3f8f5a]" : "border-glass-border bg-subtle text-muted"}`}>
      <span className={`grid size-[18px] place-items-center rounded-full border-[1.5px] ${visited ? "border-[#3f8f5a] bg-[#3f8f5a] text-white" : "border-current"}`}>{visited ? <Check aria-hidden="true" size={12} strokeWidth={3} /> : null}</span>
      {visited ? "Եղել եմ այստեղ" : "Նշել, որ եղել եմ"}
    </button>
  );
}

const VISIT_COLORS = { visited: "#3f8f5a", unvisited: "#b8483e" } as const;

/** A disc with a cross: the marker of a place with no drawing or photo; green once visited, red until then. */
function crossImage(ratio: number, color: string) {
  const size = Math.round(34 * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 2 * ratio, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 2 * ratio;
  context.strokeStyle = "#fbf4e4";
  context.stroke();
  // A cross drawn with lines, so no font is needed.
  context.strokeStyle = "#fff8e8";
  context.lineWidth = 2.4 * ratio;
  context.lineCap = "round";
  const c = size / 2;
  const arm = 7 * ratio;
  context.beginPath();
  context.moveTo(c, c - arm); context.lineTo(c, c + arm);
  context.moveTo(c - arm * 0.75, c - arm * 0.25); context.lineTo(c + arm * 0.75, c - arm * 0.25);
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

/** A cover photo cut into a gold-ringed circle, the marker of a place with photos but no drawing. */
async function photoImage(url: string, ratio: number) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  const size = Math.round(46 * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 3 * ratio, 0, Math.PI * 2);
  context.clip();
  const side = Math.min(image.width, image.height);
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
  context.restore();
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2 - 1.5 * ratio, 0, Math.PI * 2);
  context.lineWidth = 3 * ratio;
  context.strokeStyle = "#c9a052";
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

/** Drawings appear only this close (about half a kilometre across a phone screen); farther, the disc. */
const DRAWING_ZOOM = 15.5;
/** A drawing's largest side on the map, in CSS pixels, whatever size the uploaded file is. */
const DRAWING_SIZE = 70;

/** A church's drawing scaled down to fit DRAWING_SIZE, sharp on the phone's screen. */
async function drawingImage(url: string, ratio: number) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  const scale = (DRAWING_SIZE * ratio) / Math.max(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Recolours the map for the site's light or dark theme. */
function applyPalette(map: MapInstance, theme: MapTheme) {
  const colors = MAP_PALETTES[theme];
  const set = (layer: string, property: string, value: string) => { if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, value as never); };
  set("land", "background-color", colors.land);
  set("water", "fill-color", colors.water);
  set("waterway", "line-color", colors.waterLine);
  set("roads-minor", "line-color", colors.minor);
  set("roads-secondary", "line-color", colors.major);
  set("roads-primary", "line-color", colors.major);
  set("roads-motorway", "line-color", colors.motorway);
  set("road-names", "text-color", colors.label);
  set("road-names", "text-halo-color", colors.halo);
  set("armenia-border", "line-color", colors.border);
}

/**
 * Armenia alone, as its own shape on the page (no frame, nothing of the countries around): land,
 * water, roads and road names from OpenFreeMap's vector tiles in the site's light or dark colours,
 * with every published place on it. Nearby places gather into gold counts; tapping a church opens
 * its card. With `focus`, a small framed map of that one place (a place's own page).
 */
/** Which places the big map shows: all, those marked «Եղել եմ», or the rest. */
export type PlacesShown = "all" | "visited" | "unvisited";

type SavedView = { lng: number; lat: number; zoom: number; selected: string | null };
const VIEW_KEY = "library-places-view";

/** Where the reader left the big map (this tab only), so coming back from a place doesn't start over. */
function savedView(): SavedView | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null") as SavedView | null;
    return value && Number.isFinite(value.lng) && Number.isFinite(value.lat) && Number.isFinite(value.zoom) ? value : null;
  } catch {
    return null;
  }
}

function saveView(view: SavedView) {
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* Private mode: the map just starts over. */ }
}

/** «Իմ մոտակայքում»: the reader's position and the radius around it, in kilometres. */
export type NearView = { latitude: number; longitude: number; radiusKm: number };

function nearData(near: NearView | null | undefined) {
  if (!near) return { type: "FeatureCollection" as const, features: [] };
  return {
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, properties: { part: "area" }, geometry: { type: "Polygon" as const, coordinates: [circleRing(near, near.radiusKm)] } },
      { type: "Feature" as const, properties: { part: "me" }, geometry: { type: "Point" as const, coordinates: [near.longitude, near.latitude] } },
    ],
  };
}

export function PlacesMap({ places, focus, visited = new Set<string>(), onToggleVisit, only, fitKey = "", near }: {
  places: MapPlace[]; focus?: string; visited?: Set<string>; onToggleVisit?: (id: string) => void;
  /** The places the filters leave (all when absent). */
  only?: Set<string>;
  /** Changes when the province filter does: the map then frames the places left. */
  fitKey?: string;
  /** The reader's position and radius: drawn as a dot in a ring, and the map frames the ring. */
  near?: NearView | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [closing, setClosing] = useState(false);
  // Until the first tiles are drawn (slow connections), Armenia's outline shimmers in the map's place.
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  // The map is built once per list of places; the visited marks and the filter repaint it without rebuilding.
  const visitedRef = useRef(visited);
  visitedRef.current = visited;
  const onlyRef = useRef(only);
  onlyRef.current = only;
  const nearRef = useRef(near);
  nearRef.current = near;
  const features = (seen: Set<string>) => ({
    type: "FeatureCollection" as const,
    features: places.filter((place) => !onlyRef.current || onlyRef.current.has(place.id)).map((place) => ({
      type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [place.longitude, place.latitude] },
      properties: {
        id: place.id, visited: seen.has(place.id), drawing: Boolean(place.icon), photo: Boolean(place.cover), pictured: Boolean(place.icon || place.cover),
        // Far away every place is a small disc (or its round photo); close up, its drawing.
        far: place.cover ? `photo-${place.id}` : seen.has(place.id) ? "cross-visited" : "cross-unvisited",
        near: place.icon ? `icon-${place.id}` : place.cover ? `photo-${place.id}` : seen.has(place.id) ? "cross-visited" : "cross-unvisited",
      },
    })),
  });
  useEffect(() => {
    const source = mapRef.current?.getSource("places") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(features(visited));
  }, [visited, only]); // eslint-disable-line react-hooks/exhaustive-deps

  // A province picked in the filters: the map frames its places (not on the first draw, which keeps
  // where the reader left it).
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) { firstFit.current = false; return; }
    const map = mapRef.current;
    const shown = places.filter((place) => !only || only.has(place.id));
    if (!map || !fitKey || !shown.length) return;
    const lngs = shown.map((place) => place.longitude);
    const lats = shown.map((place) => place.latitude);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, maxZoom: 13, duration: 700 });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Իմ մոտակայքում» on: the ring and the dot are drawn and the map frames the ring; off: they go.
  const nearKey = near ? `${near.latitude},${near.longitude},${near.radiusKm}` : "";
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("near") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!map || !source) return;
    source.setData(nearData(near));
    if (!near) return;
    const ring = circleRing(near, near.radiusKm);
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 24, duration: 800 });
  }, [nearKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // The card closes with a short fade: by its ✕, a tap on the map, or a tap anywhere else on the page.
  const close = () => {
    if (!selectedRef.current) return;
    setClosing(true);
    window.setTimeout(() => { setSelected(null); setClosing(false); }, 160);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!selected) return;
    const outside = (event: PointerEvent) => { if (frame.current && !frame.current.contains(event.target as Node)) closeRef.current(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [selected]);

  // Back from a place's page: its card opens again where it was.
  useEffect(() => {
    if (!focus) setSelected(savedView()?.selected ?? null);
  }, [focus]);
  useEffect(() => {
    const map = mapRef.current;
    if (focus || !map) return;
    const center = map.getCenter();
    saveView({ lng: center.lng, lat: center.lat, zoom: map.getZoom(), selected });
  }, [selected, focus]);

  useEffect(() => {
    let map: MapInstance | null = null;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    void (async () => {
      const module = await import("maplibre-gl");
      // The UMD build arrives as a default export; keep either shape working.
      const maplibre = ((module as unknown as { default?: MapLibre }).default ?? module) as MapLibre;
      if (cancelled || !container.current) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const armenia = new maplibre.LngLatBounds([ARMENIA_BOUNDS[0][1], ARMENIA_BOUNDS[0][0]], [ARMENIA_BOUNDS[1][1], ARMENIA_BOUNDS[1][0]]);
      const focused = focus ? places.find((place) => place.id === focus) : undefined;
      const left = focus ? null : savedView();
      map = new maplibre.Map({
        container: container.current,
        style: mapStyle(currentTheme()),
        attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, maxZoom: 18,
        ...(focused ? { center: [focused.longitude, focused.latitude] as [number, number], zoom: DRAWING_ZOOM + 0.5 }
          : left ? { center: [left.lng, left.lat] as [number, number], zoom: left.zoom }
          : { bounds: armenia, fitBoundsOptions: { padding: 14 } }),
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      const m = map;

      // The whole page is the frame: everything outside Armenia's border is cut away.
      const clip = () => {
        if (focus || !container.current) return;
        const d = ARMENIA_BORDER.map((ring) => `M${ring.map(([lat, lng]) => { const p = m.project([lng, lat]); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join("L")}Z`).join("");
        container.current.style.clipPath = `path('${d}')`;
      };

      m.once("idle", () => { if (!cancelled) setReady(true); });
      m.on("load", () => {
        if (!focus) {
          // No farther out than all of Armenia, also when the map opened where the reader left it.
          m.setMinZoom((m.cameraForBounds(armenia, { padding: 14 })?.zoom ?? m.getZoom()) - 0.1);
          m.setMaxBounds([[armenia.getWest() - 0.6, armenia.getSouth() - 0.4], [armenia.getEast() + 0.6, armenia.getNorth() + 0.4]]);
        }
        m.addSource("armenia", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: ARMENIA_BORDER.map((ring) => ring.map(([lat, lng]) => [lng, lat])) } } });
        m.addLayer({ id: "armenia-border", type: "line", source: "armenia", paint: { "line-color": MAP_PALETTES[currentTheme()].border, "line-width": 3, "line-opacity": 0.9 } });

        // «Իմ մոտակայքում»: the ring around the reader and their dot, under the places.
        m.addSource("near", { type: "geojson", data: nearData(nearRef.current) });
        m.addLayer({ id: "near-area", type: "fill", source: "near", filter: ["==", ["get", "part"], "area"], paint: { "fill-color": "#d9b56f", "fill-opacity": 0.13 } });
        m.addLayer({ id: "near-edge", type: "line", source: "near", filter: ["==", ["get", "part"], "area"], paint: { "line-color": "#b07d2e", "line-width": 1.6, "line-dasharray": [3, 2], "line-opacity": 0.85 } });
        m.addLayer({ id: "near-halo", type: "circle", source: "near", filter: ["==", ["get", "part"], "me"], paint: { "circle-radius": 17, "circle-color": "#2f7fd8", "circle-opacity": 0.18 } });
        m.addLayer({ id: "near-me", type: "circle", source: "near", filter: ["==", ["get", "part"], "me"], paint: { "circle-radius": 7, "circle-color": "#2f7fd8", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });

        m.addImage("cross-visited", crossImage(ratio, VISIT_COLORS.visited), { pixelRatio: ratio });
        m.addImage("cross-unvisited", crossImage(ratio, VISIT_COLORS.unvisited), { pixelRatio: ratio });
        m.addSource("places", { type: "geojson", cluster: !focus, clusterRadius: 40, clusterMaxZoom: 12, data: features(visitedRef.current) });
        m.addLayer({
          id: "clusters", type: "circle", source: "places", filter: ["has", "point_count"],
          paint: {
            "circle-color": "#c39448", "circle-stroke-color": "#fbf4e4", "circle-stroke-width": 3,
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 50, 21], "circle-opacity": 0.95,
          },
        });
        m.addLayer({
          id: "cluster-count", type: "symbol", source: "places", filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": "#2a1708" },
        });
        m.addLayer({
          id: "places", type: "symbol", source: "places", filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["step", ["zoom"], ["get", "far"], DRAWING_ZOOM, ["get", "near"]], "icon-allow-overlap": true,
            "icon-anchor": ["step", ["zoom"], "center", DRAWING_ZOOM, ["case", ["get", "drawing"], "bottom", "center"]],
          },
        });

        // A drawing or photo marker carries its visited colour as a small dot at its foot.
        m.addLayer({
          id: "place-status", type: "circle", source: "places", filter: ["all", ["!", ["has", "point_count"]], ["get", "pictured"]],
          paint: {
            "circle-radius": 5, "circle-color": ["case", ["get", "visited"], VISIT_COLORS.visited, VISIT_COLORS.unvisited], "circle-stroke-color": "#fbf4e4", "circle-stroke-width": 1.5,
            // A far-away drawing place is already a coloured disc: its dot shows only with the drawing.
            "circle-opacity": ["step", ["zoom"], ["case", ["get", "photo"], 1, 0], DRAWING_ZOOM, 1],
            "circle-stroke-opacity": ["step", ["zoom"], ["case", ["get", "photo"], 1, 0], DRAWING_ZOOM, 1],
          },
        });

        // Drawings and cover photos arrive one by one; each shows as soon as it is loaded.
        for (const place of places) {
          if (place.icon) {
            void drawingImage(placeMediaUrl(place.icon), ratio).then((data) => { if (!m.hasImage(`icon-${place.id}`)) m.addImage(`icon-${place.id}`, data, { pixelRatio: ratio }); }).catch(() => undefined);
          }
          if (place.cover) {
            void photoImage(placeMediaUrl(place.cover), ratio).then((data) => { if (!m.hasImage(`photo-${place.id}`)) m.addImage(`photo-${place.id}`, data, { pixelRatio: ratio }); }).catch(() => undefined);
          }
        }

        if (!focus) {
          m.on("click", "clusters", async (event) => {
            const feature = event.features?.[0];
            const source = m.getSource("places") as import("maplibre-gl").GeoJSONSource;
            if (!feature) return;
            const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id as number);
            m.easeTo({ center: (feature.geometry as { coordinates: [number, number] }).coordinates, zoom: zoom + 0.3 });
          });
          m.on("click", "places", (event) => { const id = event.features?.[0]?.properties.id; if (typeof id === "string") setSelected(id); });
          m.on("click", (event) => { if (!m.queryRenderedFeatures(event.point, { layers: ["places", "clusters"] }).length) closeRef.current(); });
          for (const layer of ["places", "clusters"]) {
            m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
            m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; });
          }
        }
        clip();
      });
      m.on("move", clip);
      if (!focus) m.on("moveend", () => { const center = m.getCenter(); saveView({ lng: center.lng, lat: center.lat, zoom: m.getZoom(), selected: selectedRef.current }); });
      m.on("resize", clip);
      // The site's theme can change while the map is open (settings, sunset).
      observer = new MutationObserver(() => applyPalette(m, currentTheme()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })();
    return () => { cancelled = true; observer?.disconnect(); map?.remove(); mapRef.current = null; };
  }, [places, focus]);

  const current = places.find((place) => place.id === selected);
  const zoom = (by: number) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + by });
  return (
    <div ref={frame} className={focus ? "places-map-small" : "places-map-free"}>
      <div ref={container} className={`places-map ${ready ? "" : "is-loading"}`} role="region" aria-label="Սրբավայրերի քարտեզ" />
      <div className={`places-map-loading ${ready ? "is-ready" : ""}`} role="status" aria-label={ready ? undefined : "Քարտեզը բեռնվում է…"}>
        {focus ? <span className="page-bone block h-full w-full" /> : <ArmeniaOutline />}
      </div>
      <div className="places-map-zoom">
        <button type="button" onClick={() => zoom(1)} aria-label="Մոտեցնել"><Plus aria-hidden="true" size={17} /></button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Հեռացնել"><Minus aria-hidden="true" size={17} /></button>
      </div>
      {current ? <PlaceCard key={current.id} place={current} onClose={close} closing={closing} visited={visited.has(current.id)} onToggleVisit={() => onToggleVisit?.(current.id)} /> : null}

    </div>
  );
}
