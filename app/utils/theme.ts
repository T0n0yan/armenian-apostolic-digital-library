import {
  normalizeTextSizePreference,
  normalizeThemePreference,
  resolveTheme,
  TEXT_SIZE_STORAGE_KEY,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  type TextSizePreference,
  type ThemePreference,
} from "../../shared/theme";

export { THEME_STORAGE_KEY, TEXT_SIZE_STORAGE_KEY, type TextSizePreference, type ThemePreference } from "../../shared/theme";

type TelegramChrome = {
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
};

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The preference still applies for the current session.
  }
}

export function readStoredThemePreference(): ThemePreference {
  return normalizeThemePreference(readStorage(THEME_STORAGE_KEY));
}

export function readStoredTextSize(): TextSizePreference {
  return normalizeTextSizePreference(readStorage(TEXT_SIZE_STORAGE_KEY));
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
  const color = THEME_COLORS[resolved];
  window.document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  // Match Telegram's own header and background to the page so the Mini App has no mismatched band.
  const webApp = (window as Window & { Telegram?: { WebApp?: TelegramChrome } }).Telegram?.WebApp;
  if (root.dataset.telegramContext === "true" && webApp) {
    try {
      webApp.setHeaderColor?.(color);
      webApp.setBackgroundColor?.(color);
      webApp.setBottomBarColor?.(color);
    } catch {
      // Older Telegram clients lack these methods.
    }
  }
}

export function applyTextSize(size: TextSizePreference) {
  window.document.documentElement.dataset.textSize = size;
}
