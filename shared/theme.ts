export type ThemePreference = "system" | "light" | "dark" | "sun";
export type ResolvedTheme = "light" | "dark";
/** Reading text size in CSS pixels. */
export type TextSizePreference = number;
export const TEXT_SIZE_MIN = 12;
export const TEXT_SIZE_MAX = 20;
export const TEXT_SIZE_DEFAULT = 16;

export const THEME_STORAGE_KEY = "library-theme-v1";
export const TEXT_SIZE_STORAGE_KEY = "library-text-size-v1";
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f4ead6", dark: "#100817" };

export function normalizeThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" || value === "sun" ? value : "system";
}

export function normalizeTextSizePreference(value: string | null): TextSizePreference {
  // Earlier versions stored named sizes.
  if (value === "large") return 18;
  if (value === "xlarge") return 20;
  const size = Number(value);
  return Number.isFinite(size) && value !== null && value !== ""
    ? Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(size)))
    : TEXT_SIZE_DEFAULT;
}

/** Where the sun is computed for the "sun" theme when the reader hasn't shared a location. */
const YEREVAN = { latitude: 40.18, longitude: 44.51 };

/**
 * Sunrise and sunset (as Date) for a day and place, by the NOAA solar equations; null in polar
 * day or night. Accurate to a minute or two, which is plenty for switching a theme.
 */
export function sunTimes(date: Date, latitude: number, longitude: number): { sunrise: Date; sunset: Date } | null {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const cosHour = Math.cos(90.833 * rad) / (Math.cos(latitude * rad) * Math.cos(declination)) - Math.tan(latitude * rad) * Math.tan(declination);
  if (cosHour < -1 || cosHour > 1) return null;
  const hourAngle = Math.acos(cosHour) / rad;
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const minutes = (sign: number) => 720 - 4 * (longitude + sign * hourAngle) - equationOfTime;
  return { sunrise: new Date(midnight + minutes(1) * 60_000), sunset: new Date(midnight + minutes(-1) * 60_000) };
}

/** "sun" theme: light between sunrise and sunset, dark at night. */
export function themeBySun(now: Date, place: { latitude: number; longitude: number } | null): ResolvedTheme {
  const { latitude, longitude } = place ?? YEREVAN;
  const times = sunTimes(now, latitude, longitude);
  if (!times) return Math.abs(latitude) > 60 && (now.getUTCMonth() > 3 && now.getUTCMonth() < 9) === latitude > 0 ? "light" : "dark";
  return now >= times.sunrise && now < times.sunset ? "light" : "dark";
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
  telegramTheme: ResolvedTheme | null = null,
  place: { latitude: number; longitude: number } | null = null,
  now: Date = new Date(),
): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (preference === "sun") return themeBySun(now, place);
  return telegramTheme ?? (systemDark ? "dark" : "light");
}

/** Telegram passes its theme in the launch URL hash; a dark bg_color means the dark scheme. */
export function telegramThemeFromLaunchHash(hash: string): ResolvedTheme | null {
  try {
    const params = new URLSearchParams(hash.replace(/^#/u, ""));
    if (!params.has("tgWebAppData") && !params.has("tgWebAppThemeParams")) return null;
    const color = (JSON.parse(params.get("tgWebAppThemeParams") ?? "{}") as { bg_color?: string }).bg_color;
    const match = /^#?([0-9a-f]{6})$/iu.exec(color ?? "");
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    const luminance = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
    return luminance < 128 ? "dark" : "light";
  } catch {
    return null;
  }
}
