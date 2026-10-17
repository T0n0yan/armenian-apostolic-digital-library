import { Monitor, Moon, Sun } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

import {
  applyThemePreference,
  readStoredThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../utils/theme";

const themeOrder: ThemePreference[] = ["system", "light", "dark"];
const themeLabels: Record<ThemePreference, string> = {
  system: "Ավտոմատ թեմա",
  light: "Բաց թեմա",
  dark: "Մուգ թեմա",
};

export const ThemeToggle = memo(function ThemeToggle({className}: {className?: string}) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const initial = readStoredThemePreference();
      setPreference(initial);
      applyThemePreference(initial);
    } catch {
      applyThemePreference("system");
    }
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyThemePreference("system");
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
      applyThemePreference(next);
      return next;
    });
  }, []);

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  const nextPreference = themeOrder[(themeOrder.indexOf(preference) + 1) % themeOrder.length];

  return (
    <button
      className={className ?? "grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-glass-border bg-subtle p-0 text-muted transition-[color,transform,background] duration-[160ms] outline-none hover:-translate-y-px hover:bg-glass-highlight hover:text-gold-bright focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3"}
      type="button"
      onClick={cycleTheme}
      aria-label={`${themeLabels[preference]}։ Փոխել՝ ${themeLabels[nextPreference]}`}
      title={themeLabels[preference]}
    >
      <Icon aria-hidden="true" size={className ? 21 : 18} strokeWidth={className ? 1.75 : 1.9} />
    </button>
  );
});
