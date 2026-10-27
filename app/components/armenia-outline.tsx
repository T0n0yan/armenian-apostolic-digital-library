import { ARMENIA_BORDER, ARMENIA_BOUNDS } from "../utils/armenia-border";

/**
 * Armenia's outline as one SVG path, projected the way the map draws it (Web Mercator), so the
 * loading shape and the real map have the same silhouette.
 */
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
const [[south, west], [north, east]] = ARMENIA_BOUNDS;
const WIDTH = 1000;
const HEIGHT = Math.round((WIDTH * (mercatorY(north) - mercatorY(south))) / (east - west));
const PATH = ARMENIA_BORDER.map((ring) => `M${ring.map(([lat, lng]) =>
  `${(((lng - west) / (east - west)) * WIDTH).toFixed(1)},${(((mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))) * HEIGHT).toFixed(1)}`).join("L")}Z`).join("");

/** The country in soft gold with a light passing over it, while the map loads. */
export function ArmeniaOutline({ className = "" }: { className?: string }) {
  return (
    <svg className={`armenia-outline ${className}`} viewBox={`-12 -12 ${WIDTH + 24} ${HEIGHT + 24}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="armenia-outline-shine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={WIDTH} y2="0">
          <stop offset="0" className="armenia-outline-base" />
          <stop offset="0.5" className="armenia-outline-light" />
          <stop offset="1" className="armenia-outline-base" />
          <animateTransform attributeName="gradientTransform" type="translate" from={`${-WIDTH} 0`} to={`${WIDTH} 0`} dur="1.6s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d={PATH} fill="url(#armenia-outline-shine)" className="armenia-outline-shape" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
