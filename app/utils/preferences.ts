/**
 * Reader preferences kept on the device (localStorage) and applied as data attributes on <html>,
 * so CSS can follow them. The boot script in root.tsx applies them before the first paint.
 */
import { writeStorage } from "./theme";

export type ReadingFont = "auto" | "book" | "serif" | "sans";
export type TitleSize = "small" | "medium" | "large";
export type Leading = "normal" | "wide";
export type Motion = "full" | "reduced";
export type Toggle = "on" | "off";

export const PREFERENCE_KEYS = {
  readingFont: "library-reading-font",
  titleSize: "library-title-size",
  leading: "library-leading",
  motion: "library-motion",
  alarmSound: "library-alarm-sound",
  dailyVerse: "library-daily-verse",
  sunPlace: "library-sun-place",
} as const;

type Preferences = { readingFont: ReadingFont; titleSize: TitleSize; leading: Leading; motion: Motion; alarmSound: Toggle; dailyVerse: Toggle };

const DEFAULTS: Preferences = { readingFont: "auto", titleSize: "small", leading: "normal", motion: "full", alarmSound: "on", dailyVerse: "on" };
const ALLOWED: { [K in keyof Preferences]: readonly Preferences[K][] } = {
  readingFont: ["auto", "book", "serif", "sans"],
  titleSize: ["small", "medium", "large"],
  leading: ["normal", "wide"],
  motion: ["full", "reduced"],
  alarmSound: ["on", "off"],
  dailyVerse: ["on", "off"],
};
/** Attribute names on <html> (the boot script uses the same). */
const ATTRIBUTES: { [K in keyof Preferences]: string } = {
  readingFont: "readingFont", titleSize: "titleSize", leading: "leading", motion: "motion", alarmSound: "alarmSound", dailyVerse: "dailyVerse",
};

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function readPreference<K extends keyof Preferences>(name: K): Preferences[K] {
  const value = typeof window === "undefined" ? null : read(PREFERENCE_KEYS[name]);
  // Animations default off when the phone asks for less motion or to save data/battery.
  if (name === "motion" && value === null && typeof window !== "undefined" && document.documentElement.dataset.motion === "reduced") return "reduced" as Preferences[K];
  return (ALLOWED[name] as readonly string[]).includes(value ?? "") ? value as Preferences[K] : DEFAULTS[name];
}

export function setPreference<K extends keyof Preferences>(name: K, value: Preferences[K]) {
  writeStorage(PREFERENCE_KEYS[name], value);
  document.documentElement.dataset[ATTRIBUTES[name]] = value;
}

export function readSunPlace(): { latitude: number; longitude: number } | null {
  try {
    const place = JSON.parse(read(PREFERENCE_KEYS.sunPlace) ?? "null") as { latitude?: number; longitude?: number } | null;
    return place && typeof place.latitude === "number" && typeof place.longitude === "number" ? { latitude: place.latitude, longitude: place.longitude } : null;
  } catch {
    return null;
  }
}

export function saveSunPlace(place: { latitude: number; longitude: number }) {
  // Two decimals (about a kilometre) are plenty for sunrise times and keep the place vague.
  writeStorage(PREFERENCE_KEYS.sunPlace, JSON.stringify({ latitude: Math.round(place.latitude * 100) / 100, longitude: Math.round(place.longitude * 100) / 100 }));
}
