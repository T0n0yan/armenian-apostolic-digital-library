import { BookOpen, Check, Church, Code2, LocateFixed, Monitor, Moon, Sparkles, Sun, SunMoon, Type } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRouteLoaderData } from "react-router";

import {
  applyTextSize, applyThemePreference, readStoredTextSize, readStoredThemePreference,
  TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STORAGE_KEY, THEME_STORAGE_KEY, writeStorage, type ThemePreference,
} from "../utils/theme";
import { readPreference, readSunPlace, saveSunPlace, setPreference, type Motion, type ReadingFont, type TitleSize, type Toggle } from "../utils/preferences";
import { sunTimes } from "../../shared/theme";
import { formatClock } from "../utils/armenian-date";

function Choice<T extends string>({ value, options, onChange, columns = 3 }: {
  value: T; options: Array<{ value: T; label: string; icon?: ReactNode; sample?: ReactNode }>; onChange: (value: T) => void; columns?: number;
}) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <div className="relative grid gap-1 rounded-card border border-glass-border bg-subtle p-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup">
      {/* Ընտրվածի ապակե ֆոնը սահում է (ինչպես «Իմ անկյունը»-ի ներդիրները)։ */}
      {index >= 0 ? (
        <span aria-hidden="true" className="tab-glider pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 rounded-button"
          style={{ width: `calc((100% - 12px - ${(columns - 1) * 4}px) / ${columns})`, transform: `translateX(calc(${index % columns} * (100% + 4px)))` }} />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={`relative z-[1] grid h-[58px] min-w-0 cursor-pointer justify-items-center content-center gap-1 rounded-button border-0 bg-transparent px-0 py-2 text-[11px] font-semibold outline-none transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] ${active ? "text-gold-bright" : "text-muted hover:text-ink"}`}
            type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
          >
            {option.sample ?? option.icon}
            {/* One line in every option, so the rows keep one height. */}
            <span className="max-w-full whitespace-nowrap text-center leading-tight tracking-[-0.02em]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Setting({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="frosted-panel grid gap-3 px-3 py-3.5">
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
    <button className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-control border border-glass-border bg-subtle px-3.5 text-[13.5px] font-semibold text-ink" type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
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
  const [devMode, setDevMode] = useState<Toggle>("off");
  const isAdmin = Boolean((useRouteLoaderData("root") as { isAdmin?: boolean } | undefined)?.isAdmin);
  const signedIn = Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
  // Կիրակնօրյա հարցի վիճակը՝ սերվերից (բեռնվում է միայն մուտք գործածի համար)։
  const [sundayOn, setSundayOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    void fetch("/api/sunday").then((response) => response.json() as Promise<{ promptOn?: boolean }>).then((answer) => setSundayOn(answer.promptOn ?? true)).catch(() => undefined);
  }, [signedIn]);
  const toggleSunday = async (on: boolean) => {
    setSundayOn(on);
    const response = await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: on }) }).catch(() => null);
    if (!response?.ok) setSundayOn(!on);
  };
  const [sunText, setSunText] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [hasSunPlace, setHasSunPlace] = useState(false);

  useEffect(() => {
    setTheme(readStoredThemePreference());
    setTextSize(readStoredTextSize());
    setFont(readPreference("readingFont"));
    setTitleSize(readPreference("titleSize"));
    setMotion(readPreference("motion"));
    setAlarmSound(readPreference("alarmSound"));
    setDailyVerse(readPreference("dailyVerse"));
    setDevMode(readPreference("devMode"));
  }, []);

  // Today's sunrise and sunset for the "sun" theme.
  // Հաշվում ենք միշտ (ոչ միայն «Ըստ ժամի»-ի ժամանակ), որ թաքնված բացատրությունը նույն երկարությունն ունենա, և բաժինը չցատկի։
  useEffect(() => {
    setHasSunPlace(Boolean(readSunPlace()));
    const place = readSunPlace() ?? { latitude: 40.18, longitude: 44.51 };
    const times = sunTimes(new Date(), place.latitude, place.longitude);
    const time = formatClock;
    setSunText(times ? `Բաց՝ ${time(times.sunrise)}-ից, մուգ՝ ${time(times.sunset)}-ից${readSunPlace() ? "" : " (Երևանի ժամով)"}` : null);
  }, [locating]);

  // Նախ ընտրված կոճակը (անմիջապես երևում է), հետո՝ ծանր վերաներկումը հաջորդ կադրում։
  const chooseTheme = (next: ThemePreference) => {
    setTheme(next);
    writeStorage(THEME_STORAGE_KEY, next);
    requestAnimationFrame(() => setTimeout(() => applyThemePreference(next, { animate: true }), 0));
  };
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
        <Setting icon={<SunMoon aria-hidden="true" size={18} />} title="Կայքի լուսավորություն" hint={
          // Բոլոր բացատրությունները նույն տեղում են (երևում է միայն ընտրվածը), որ բաժնի բարձրությունը
          // չփոխվի և թեման փոխելիս վահանակը չցատկի։
          <span className="grid">
            {(["system", "sun", "light", "dark"] as const).map((option) => (
              <span key={option} className={`[grid-area:1/1] ${option === theme ? "" : "invisible"}`}>
                {option === "sun" ? (
                  <>
                    {sunText ?? "Ցերեկը բաց, երեկոյից մուգ"}
                    <br />
                    <button className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-glass-border bg-transparent px-2.5 text-[12px] font-semibold text-gold-bright" type="button" onClick={locate} disabled={locating}>
                      <LocateFixed aria-hidden="true" size={14} /> {hasSunPlace ? "Թարմացնել իմ վայրը" : "Օգտագործել իմ վայրը"}
                    </button>
                  </>
                ) : option === "system" ? "Ինչպես Ձեր հեռախոսում (կամ Telegram-ում)" : "«Ըստ ժամի»՝ ցերեկը բաց, երեկոյից մուգ, ըստ արևածագի ու մայրամուտի"}
              </span>
            ))}
          </span>
        }>
          <Choice columns={4} value={theme} onChange={chooseTheme} options={[
            { value: "system", label: "Սարքի պես", icon: <Monitor aria-hidden="true" size={17} /> },
            { value: "sun", label: "Ըստ ժամի", icon: <SunMoon aria-hidden="true" size={17} /> },
            { value: "light", label: "Բաց", icon: <Sun aria-hidden="true" size={17} /> },
            { value: "dark", label: "Մուգ", icon: <Moon aria-hidden="true" size={17} /> },
          ]} />
        </Setting>

        <Setting icon={<BookOpen aria-hidden="true" size={18} />} title="Ընթերցանության տառատեսակ" hint="«Ըստ բաժնի»՝ աղոթքներն ու սաղմոսները Արիան գրքով, մնացածը՝ իրենց տառատեսակով։">
          <Choice columns={4} value={font} onChange={(next) => { setFont(next); setPreference("readingFont", next); }} options={[
            { value: "auto", label: "Ըստ բաժնի", sample: <span className="text-[17px] leading-none">Աա</span> },
            { value: "book", label: "Արիան", sample: <span className="font-book text-[19px] leading-none">Աա</span> },
            { value: "serif", label: "Նոտո", sample: <span className="font-noto text-[18px] leading-none">Աա</span> },
            { value: "sans", label: "Պարզ", sample: <span className="font-sans text-[18px] leading-none">Աա</span> },
          ]} />
          <p className={`m-0 rounded-control bg-subtle px-3.5 py-2.5 text-center text-ink ${font === "book" ? "font-book" : font === "serif" ? "font-noto" : "font-sans"}`} style={{ fontSize: textSize + 1, lineHeight: 1.7 }}>{sample}</p>
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
          {/* Shows right here how page titles will look. */}
          <p className="m-0 rounded-control bg-subtle px-3.5 py-3 text-center font-noto font-medium leading-tight text-ink transition-[font-size] duration-200" style={{ fontSize: `${(titleSize === "small" ? 0.85 : titleSize === "large" ? 1.18 : 1) * 26}px` }}>Սաղմոս Դաւթի</p>
        </Setting>

        <Setting icon={<Sparkles aria-hidden="true" size={18} />} title="Այլ">
          <Switch label="Օրվա համարը գլխավոր էջում" checked={dailyVerse === "on"} onChange={(on) => { const next = on ? "on" : "off"; setDailyVerse(next); setPreference("dailyVerse", next); }} />
          <Switch label="Հիշեցման զանգի ձայնը" checked={alarmSound === "on"} onChange={(on) => { const next = on ? "on" : "off"; setAlarmSound(next); setPreference("alarmSound", next); }} />
          <Switch label="Անիմացիաներ" checked={motion === "full"} onChange={(on) => { const next = on ? "full" : "reduced"; setMotion(next); setPreference("motion", next); }} />
        </Setting>

        {signedIn ? (
          // Կիրակնօրյա հարցը («Եղե՞լ եք Պատարագի») և ծանուցումը. պահվում է հաշվում։
          <Setting icon={<Church aria-hidden="true" size={18} />} title="Սուրբ Պատարագ" hint="Կիրակի օրերին և մեծ տոներին հարցնում ենք՝ եղե՞լ եք Պատարագի։ Պատասխանները երևում են «Իմ տարին»-ում։">
            <Switch label="Կիրակնօրյա հարց" checked={sundayOn ?? true} onChange={(on) => void toggleSunday(on)} />
          </Setting>
        ) : null}

        {isAdmin ? (
          // Admins only: lifts the copy/selection protections to work with the texts.
          <Setting icon={<Code2 aria-hidden="true" size={18} />} title="Մշակողի ռեժիմ">
            <Switch label="Թույլատրել ընտրել և պատճենել" checked={devMode === "on"} onChange={(on) => { const next = on ? "on" : "off"; setDevMode(next); setPreference("devMode", next); }} />
          </Setting>
        ) : null}

        <p className="m-0 flex items-center justify-center gap-1.5 text-[12px] text-faint"><Check aria-hidden="true" size={14} /> Փոփոխությունները պահվում են անմիջապես</p>
      </div>
  );
}
