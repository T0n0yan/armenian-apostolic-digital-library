import {
  normalizeThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../../shared/theme";

export { THEME_STORAGE_KEY, type ThemePreference } from "../../shared/theme";

export function readStoredThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const root = window.document.documentElement;
  const telegramTheme = root.dataset.telegramContext === "true" &&
      (root.dataset.telegramTheme === "light" || root.dataset.telegramTheme === "dark")
    ? root.dataset.telegramTheme
    : null;
  const resolved = resolveTheme(
    preference,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
    telegramTheme,
  );
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  window.document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#100817" : "#f2ebf4");
}
