import { Monitor, Moon, Sun } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "library-theme-v1";
const themeOrder: ThemePreference[] = ["system", "light", "dark"];
const themeLabels: Record<ThemePreference, string> = {
  system: "Ավտոմատ թեմա",
  light: "Բաց թեմա",
  dark: "Մուգ թեմա",
};

function applyTheme(preference: ThemePreference) {
  const root = window.document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;

  const isDark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  window.document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#100817" : "#f2ebf4");
}

export const ThemeToggle = memo(function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      const initial = themeOrder.includes(saved as ThemePreference)
        ? (saved as ThemePreference)
        : "system";
      setPreference(initial);
      applyTheme(initial);
    } catch {
      applyTheme("system");
    }
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [preference]);

  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      const next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // The visual preference still applies for the current session.
      }
      applyTheme(next);
      return next;
    });
  }, []);

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  const nextPreference = themeOrder[(themeOrder.indexOf(preference) + 1) % themeOrder.length];

  return (
    <button
      className="site-nav-icon-button"
      type="button"
      onClick={cycleTheme}
      aria-label={`${themeLabels[preference]}։ Փոխել՝ ${themeLabels[nextPreference]}`}
      title={themeLabels[preference]}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
    </button>
  );
});
