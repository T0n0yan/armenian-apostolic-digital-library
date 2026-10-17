import { Monitor, Moon, Sun } from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";

import {
  applyTextSize,
  applyThemePreference,
  readStoredTextSize,
  readStoredThemePreference,
  TEXT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  writeStorage,
  type TextSizePreference,
  type ThemePreference,
} from "../utils/theme";

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={label}>
      <span className="px-1 text-[12px] font-semibold text-muted">{label}</span>
      <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-glass-border bg-subtle p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-0 px-2 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgb(217_181_111/45%)] ${active ? "bg-glass-strong text-gold-bright shadow-[0_2px_10px_rgb(12_4_17/18%)]" : "bg-transparent text-muted hover:text-ink"}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
  { value: "system", label: "Ավտոմատ", icon: <Monitor aria-hidden="true" size={15} /> },
  { value: "light", label: "Բաց", icon: <Sun aria-hidden="true" size={15} /> },
  { value: "dark", label: "Մուգ", icon: <Moon aria-hidden="true" size={15} /> },
];

const textSizeOptions: Array<{ value: TextSizePreference; label: string; icon: ReactNode }> = [
  { value: "normal", label: "Սովորական", icon: <span aria-hidden="true" className="text-[12px] font-bold">Ա</span> },
  { value: "large", label: "Մեծ", icon: <span aria-hidden="true" className="text-[15px] font-bold">Ա</span> },
  { value: "xlarge", label: "Շատ մեծ", icon: <span aria-hidden="true" className="text-[18px] font-bold">Ա</span> },
];

/** Theme and reading-size preferences, stored per device. "Ավտոմատ" follows the phone (or Telegram). */
export const ReadingSettings = memo(function ReadingSettings() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [textSize, setTextSize] = useState<TextSizePreference>("normal");

  useEffect(() => {
    setTheme(readStoredThemePreference());
    setTextSize(readStoredTextSize());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyThemePreference("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  return (
    <div className="grid gap-3">
      <Segmented
        label="Թեմա"
        value={theme}
        options={themeOptions}
        onChange={(next) => { setTheme(next); writeStorage(THEME_STORAGE_KEY, next); applyThemePreference(next); }}
      />
      <Segmented
        label="Տառաչափ"
        value={textSize}
        options={textSizeOptions}
        onChange={(next) => { setTextSize(next); writeStorage(TEXT_SIZE_STORAGE_KEY, next); applyTextSize(next); }}
      />
    </div>
  );
});
