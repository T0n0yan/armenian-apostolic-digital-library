import { BookOpen, Check, LocateFixed, Monitor, Moon, Sparkles, Sun, SunMoon, Type } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  applyTextSize, applyThemePreference, readStoredTextSize, readStoredThemePreference,
  TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STORAGE_KEY, THEME_STORAGE_KEY, writeStorage, type ThemePreference,
} from "../utils/theme";
import { readPreference, readSunPlace, saveSunPlace, setPreference, type Motion, type ReadingFont, type TitleSize, type Toggle } from "../utils/preferences";
import { sunTimes } from "../../shared/theme";

function Choice<T extends string>({ value, options, onChange, columns = 3 }: {
  value: T; options: Array<{ value: T; label: string; icon?: ReactNode; sample?: ReactNode }>; onChange: (value: T) => void; columns?: number;
}) {
  return (
    <div className="grid gap-1.5 rounded-[15px] border border-glass-border bg-subtle p-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={`grid min-h-12 cursor-pointer justify-items-center content-center gap-1 rounded-[11px] border-0 px-1.5 py-2 text-[12px] font-semibold transition-colors ${active ? "bg-glass-strong text-gold-bright shadow-[0_2px_10px_rgb(12_4_17/18%)]" : "bg-transparent text-muted hover:text-ink"}`}
            type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
          >
            {option.sample ?? option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Setting({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="frosted-panel grid gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] bg-[rgb(217_181_111/10%)] text-gold-bright">{icon}</span>
        <div className="grid gap-0.5">
          <h2 className="m-0 font-sans text-[15px] font-bold text-ink">{title}</h2>
          {hint ? <p className="m-0 text-[12.5px] leading-snug text-muted">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-[13px] border border-glass-border bg-subtle px-3.5 text-[13.5px] font-semibold text-ink" type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      {label}
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-[linear-gradient(135deg,#e2c27e,#b07d2e)]" : "bg-[rgb(120_100_80/30%)]"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200 ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

const sample = "Տերն է իմ հովիվը, ոչ մի բանի կարոտ չեմ լինի";

/** How the library looks and behaves on this device (the menu's settings view and /settings). */
export function SettingsPanel() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [textSize, setTextSize] = useState(16);
  const [font, setFont] = useState<ReadingFont>("auto");
  const [titleSize, setTitleSize] = useState<TitleSize>("small");
  const [motion, setMotion] = useState<Motion>("full");
  const [alarmSound, setAlarmSound] = useState<Toggle>("on");
  const [dailyVerse, setDailyVerse] = useState<Toggle>("on");
  const [sunText, setSunText] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setTheme(readStoredThemePreference());
    setTextSize(readStoredTextSize());
    setFont(readPreference("readingFont"));
    setTitleSize(readPreference("titleSize"));
    setMotion(readPreference("motion"));
    setAlarmSound(readPreference("alarmSound"));
    setDailyVerse(readPreference("dailyVerse"));
  }, []);

  // Today's sunrise and sunset for the "sun" theme.
  useEffect(() => {
    if (theme !== "sun") { setSunText(null); return; }
    const place = readSunPlace() ?? { latitude: 40.18, longitude: 44.51 };
    const times = sunTimes(new Date(), place.latitude, place.longitude);
    const time = (date: Date) => date.toLocaleTimeString("hy-AM", { hour: "2-digit", minute: "2-digit" });
    setSunText(times ? `Այսօր՝ արևածագ ${time(times.sunrise)}, մայրամուտ ${time(times.sunset)}${readSunPlace() ? "" : " (Երևանի համար)"}` : null);
  }, [theme, locating]);

  const chooseTheme = (next: ThemePreference) => { setTheme(next); writeStorage(THEME_STORAGE_KEY, next); applyThemePreference(next); };
  const locate = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { saveSunPlace(position.coords); applyThemePreference("sun"); setLocating(false); },
      () => setLocating(false),
      { maximumAge: 86_400_000, timeout: 10_000 },
    );
  };

  return (
      <div className="grid gap-3">
        <Setting icon={<SunMoon aria-hidden="true" size={18} />} title="Թեմա" hint={sunText ?? "«Արևով»՝ արևածագից մինչև մայրամուտ բաց, գիշերը՝ մուգ։"}>
          <Choice columns={4} value={theme} onChange={chooseTheme} options={[
            { value: "system", label: "Ավտոմատ", icon: <Monitor aria-hidden="true" size={17} /> },
            { value: "sun", label: "Արևով", icon: <SunMoon aria-hidden="true" size={17} /> },
            { value: "light", label: "Բաց", icon: <Sun aria-hidden="true" size={17} /> },
            { value: "dark", label: "Մուգ", icon: <Moon aria-hidden="true" size={17} /> },
          ]} />
          {theme === "sun" ? (
            <button className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-[12px] border border-glass-border bg-transparent px-3 text-[12.5px] font-semibold text-gold-bright" type="button" onClick={locate} disabled={locating}>
              <LocateFixed aria-hidden="true" size={15} /> {readSunPlace() ? "Թարմացնել իմ վայրը" : "Օգտագործել իմ վայրը"}
            </button>
          ) : null}
        </Setting>

        <Setting icon={<BookOpen aria-hidden="true" size={18} />} title="Ընթերցանության տառատեսակ" hint="«Ըստ բաժնի»՝ աղոթքներն ու սաղմոսները Արիան գրքով, մնացածը՝ իրենց տառատեսակով։">
          <Choice columns={4} value={font} onChange={(next) => { setFont(next); setPreference("readingFont", next); }} options={[
            { value: "auto", label: "Ըստ բաժնի", sample: <span className="text-[17px] leading-none">Աա</span> },
            { value: "book", label: "Արիան", sample: <span className="font-book text-[19px] leading-none">Աա</span> },
            { value: "serif", label: "Նոտո", sample: <span className="font-noto text-[18px] leading-none">Աա</span> },
            { value: "sans", label: "Պարզ", sample: <span className="font-sans text-[18px] leading-none">Աա</span> },
          ]} />
          <p className={`m-0 rounded-[12px] bg-subtle px-3.5 py-2.5 text-center text-ink ${font === "book" ? "font-book" : font === "serif" ? "font-noto" : "font-sans"}`} style={{ fontSize: textSize + 1, lineHeight: 1.7 }}>{sample}</p>
        </Setting>

        <Setting icon={<Type aria-hidden="true" size={18} />} title="Տառաչափ" hint={`${textSize} px`}>
          <input className="w-full accent-[#b07d2e]" type="range" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} step={1} value={textSize} aria-label="Տառաչափ"
            onChange={(event) => { const next = Number(event.target.value); setTextSize(next); writeStorage(TEXT_SIZE_STORAGE_KEY, String(next)); applyTextSize(next); }} />
          <div className="flex justify-between text-faint"><span className="text-[12px]">Աա</span><span className="text-[20px]">Աա</span></div>
        </Setting>

        <Setting icon={<span className="font-noto text-[15px] font-bold">Ա</span>} title="Վերնագրերի չափ">
          <Choice value={titleSize} onChange={(next) => { setTitleSize(next); setPreference("titleSize", next); }} options={[
            { value: "small", label: "Փոքր", sample: <span className="font-noto text-[15px] leading-none">Ա</span> },
            { value: "medium", label: "Միջին", sample: <span className="font-noto text-[19px] leading-none">Ա</span> },
            { value: "large", label: "Մեծ", sample: <span className="font-noto text-[23px] leading-none">Ա</span> },
          ]} />
        </Setting>

        <Setting icon={<Sparkles aria-hidden="true" size={18} />} title="Այլ">
          <Switch label="Օրվա համարը գլխավոր էջում" checked={dailyVerse === "on"} onChange={(on) => { const next = on ? "on" : "off"; setDailyVerse(next); setPreference("dailyVerse", next); }} />
          <Switch label="Հիշեցման զանգի ձայնը" checked={alarmSound === "on"} onChange={(on) => { const next = on ? "on" : "off"; setAlarmSound(next); setPreference("alarmSound", next); }} />
          <Switch label="Անիմացիաներ" checked={motion === "full"} onChange={(on) => { const next = on ? "full" : "reduced"; setMotion(next); setPreference("motion", next); }} />
        </Setting>

        <p className="m-0 flex items-center justify-center gap-1.5 text-[12px] text-faint"><Check aria-hidden="true" size={14} /> Փոփոխությունները պահվում են անմիջապես</p>
      </div>
  );
}
