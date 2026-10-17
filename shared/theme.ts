export type ThemePreference = "system" | "light" | "dark";
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
  return value === "light" || value === "dark" || value === "system" ? value : "system";
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

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
  telegramTheme: ResolvedTheme | null = null,
): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
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
