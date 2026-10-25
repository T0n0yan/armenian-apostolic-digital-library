import type { StyleSpecification } from "maplibre-gl";

/**
 * The places map's own look, drawn from OpenFreeMap's vector tiles (OpenMapTiles schema, no key):
 * land, water, roads and road names only — no shops, buildings or other labels. Two palettes follow
 * the site's light and dark themes.
 */
export type MapTheme = "light" | "dark";

export const MAP_PALETTES = {
  light: {
    land: "#f6eedd", water: "#d7e3e2", waterLine: "#b9cfcf", minor: "#eadcc0", major: "#dcc394", motorway: "#cfa864",
    casing: "#e2d2b0", label: "#7a5a36", halo: "#f6eedd", border: "#b07d2e",
  },
  dark: {
    land: "#1e1428", water: "#16213a", waterLine: "#22304f", minor: "#30233c", major: "#4a3650", motorway: "#7a5c34",
    casing: "#2a1d35", label: "#cdb88e", halo: "#1e1428", border: "#c9a052",
  },
} as const;

export const MAP_ATTRIBUTION = "OpenFreeMap · © OpenMapTiles · © OpenStreetMap";

const ROAD_WIDTH = (base: number) => ["interpolate", ["exponential", 1.5], ["zoom"], 7, base * 0.4, 12, base * 1.4, 16, base * 5] as unknown as number;

export function mapStyle(theme: MapTheme): StyleSpecification {
  const colors = MAP_PALETTES[theme];
  const roads = (id: string, classes: string[], color: string, width: number, minzoom: number) => ({
    id, type: "line" as const, source: "osm", "source-layer": "transportation", minzoom,
    filter: ["in", ["get", "class"], ["literal", classes]] as unknown as boolean,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
    paint: { "line-color": color, "line-width": ROAD_WIDTH(width) },
  });
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "land", type: "background", paint: { "background-color": colors.land } },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": colors.water } },
      { id: "waterway", type: "line", source: "osm", "source-layer": "waterway", minzoom: 9, paint: { "line-color": colors.waterLine, "line-width": 1 } },
      roads("roads-minor", ["minor", "service"], colors.minor, 1.2, 12),
      roads("roads-secondary", ["secondary", "tertiary"], colors.major, 1.6, 9),
      roads("roads-primary", ["primary", "trunk"], colors.major, 2.2, 6),
      roads("roads-motorway", ["motorway"], colors.motorway, 2.6, 5),
      {
        id: "road-names", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 12,
        filter: ["!", ["in", ["get", "class"], ["literal", ["path", "track"]]]] as unknown as boolean,
        layout: {
          "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:hy"], ["get", "name"]] as unknown as string,
          "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13] as unknown as number,
          "text-max-angle": 30,
        },
        paint: { "text-color": colors.label, "text-halo-color": colors.halo, "text-halo-width": 1.4 },
      },
    ],
  };
}
