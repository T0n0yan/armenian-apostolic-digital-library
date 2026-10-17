export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "library-theme-v1";

export function normalizeThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
  telegramTheme: ResolvedTheme | null = null,
): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return telegramTheme ?? (systemDark ? "dark" : "light");
}
