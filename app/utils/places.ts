/** Sacred places on the map: kinds, addresses and the small parsing the admin form needs. */
import { ARMENIA_BORDER } from "./armenia-border";

export const PLACE_KINDS = {
  monastery: "Վանք",
  church: "Եկեղեցի",
  chapel: "Մատուռ",
  complex: "Համալիր",
  shrine: "Սրբավայր",
} as const;
export type PlaceKind = keyof typeof PLACE_KINDS;

/** How the site words whether a church is working (places.active; '' is not known). */
export const ACTIVE_LABELS: Record<string, string> = { yes: "Գործող է", no: "Չի գործում", renovation: "Վերանորոգվում է" };

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === "string" && value in PLACE_KINDS;
}

const LATIN: Record<string, string> = {
  ա: "a", բ: "b", գ: "g", դ: "d", ե: "e", զ: "z", է: "e", ը: "y", թ: "t", ժ: "zh", ի: "i", լ: "l", խ: "kh", ծ: "ts",
  կ: "k", հ: "h", ձ: "dz", ղ: "gh", ճ: "ch", մ: "m", յ: "y", ն: "n", շ: "sh", ո: "o", չ: "ch", պ: "p", ջ: "j", ռ: "r",
  ս: "s", վ: "v", տ: "t", ր: "r", ց: "ts", ւ: "v", փ: "p", ք: "k", օ: "o", ֆ: "f", և: "ev",
};

/** A readable address for a place from its Armenian name: «Էջմիածնի Մայր տաճար» → ejmiatsni-mayr-tachar. */
export function placeSlug(name: string) {
  const lower = name.toLocaleLowerCase("hy").replace(/ու/gu, "u");
  const latin = [...lower].map((letter) => LATIN[letter] ?? letter).join("");
  return latin.normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "place";
}

/**
 * Coordinates from what people paste: «40.161795, 44.291395», a Google Maps link (…/@40.16,44.29,15z
 * or ?q=40.16,44.29), an Apple Maps one (?ll=40.16,44.29) or a Yandex one (?ll=44.29,40.16, longitude
 * first). Null when there are none or they fall outside the Earth.
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  // A Google place link carries the pin itself (!3d<lat>!4d<lon>); its @… is only the view's centre.
  const pin = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/u.exec(text);
  // Yandex puts the longitude first (ll=, pt=, whatshere[point]=); Apple's ll= is latitude first.
  const yandex = /yandex\./u.test(text) ? /(?:[?&]ll|[?&]pt|whatshere(?:%5B|\[)point(?:%5D|\]))=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/u.exec(text) : null;
  const match = pin ?? (yandex ? [yandex[0], yandex[2], yandex[1]] : /(-?\d{1,3}\.\d{3,})\s*(?:,|%2C|;|\s)\s*\+?(-?\d{1,3}\.\d{3,})/u.exec(text));
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** «Ինչպես հասնել»: directions in the map apps people in Armenia use. */
export function directionLinks(latitude: number, longitude: number) {
  const point = `${latitude},${longitude}`;
  return [
    { label: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${point}` },
    { label: "Yandex", href: `https://yandex.com/maps/?rtext=~${point}&rtt=auto` },
  ];
}

/** A picture of a place, kept in R2 under places/<id>/ and served by /place-media. */
export function placeMediaUrl(key: string) {
  return `/place-media/${key.replace(/^places\//u, "")}`;
}

/** Whether a point lies in Armenia (the map shows only Armenia): ray casting over the border rings. */
export function insideArmenia(latitude: number, longitude: number) {
  let inside = false;
  for (const ring of ARMENIA_BORDER) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if ((yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
