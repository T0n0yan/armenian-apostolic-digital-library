/**
 * Էջը ներկով բացելու boot-script. թեմա, Telegram-ի համատեքստ, անվտանգ գոտիներ՝ մինչ առաջին ներկումը։
 * Ստատիկ է (ամեն build՝ նույնը)։
 * Փոխելիս՝ թարմացնել հաշը (tests/boot-script.test.ts-ը ստուգում է)։
 */
export const BOOT_SCRIPT = `(() => {
  try {
    const root = document.documentElement;
    try { if (sessionStorage.getItem("library-loader-seen-v4") === "1") root.dataset.introSeen = "true"; } catch {}
    let telegramTheme = null;
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      const color = JSON.parse(params.get("tgWebAppThemeParams") || "{}").bg_color || "";
      const match = /^#?([0-9a-f]{6})$/i.exec(color);
      if (params.has("tgWebAppData") && match) {
        const value = parseInt(match[1], 16);
        telegramTheme = (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) < 128 ? "dark" : "light";
        root.dataset.telegramContext = "true";
        root.dataset.telegramTheme = telegramTheme;
      }
    } catch {}
    // Inside Telegram (launch hash, the apps' WebView bridge, Telegram Web's frame, or earlier in
    // this tab): only then is Telegram's script loaded (root.tsx).
    try {
      const inTelegram = location.hash.indexOf("tgWebAppData") >= 0 || !!window.TelegramWebviewProxy
        || (window.external && "notify" in window.external) || (window.parent !== window && /telegram\.org/.test(document.referrer))
        || sessionStorage.getItem("library-in-telegram") === "1";
      if (inTelegram) { root.dataset.inTelegram = "true"; sessionStorage.setItem("library-in-telegram", "1"); }
    } catch {}
    // Pictures marked to appear whole (.reveal-img, app.css) are shown once fully loaded.
    const mark = (name) => (event) => { const target = event.target; if (target && target.classList && target.classList.contains("reveal-img")) target.setAttribute(name, ""); };
    document.addEventListener("load", mark("data-loaded"), true);
    document.addEventListener("error", mark("data-failed"), true);
    let preference = "system";
    let textSize = 16;
    try {
      const value = localStorage.getItem("library-theme-v1");
      if (value === "light" || value === "dark" || value === "sun") preference = value;
      // Reader preferences become data attributes that CSS follows (see app/utils/preferences.ts).
      const prefs = { readingFont: ["library-reading-font", ["book", "serif", "sans"]], titleSize: ["library-title-size", ["medium", "large"]], motion: ["library-motion", ["reduced", "full"]], devMode: ["library-dev-mode", ["on"]], dailyVerse: ["library-daily-verse", ["off"]] };
      for (const name in prefs) { const stored = localStorage.getItem(prefs[name][0]); if (prefs[name][1].includes(stored)) root.dataset[name] = stored; }
      if (!root.dataset.titleSize) root.dataset.titleSize = "small";
      // Unless chosen, animations follow the phone: off in power-saving / reduced-motion / data-saver.
      if (!root.dataset.motion) root.dataset.motion = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData) ? "reduced" : "full";
      const size = localStorage.getItem("library-text-size-v1");
      const legacy = size === "large" ? 18 : size === "xlarge" ? 20 : Number(size);
      if (size && legacy >= 12 && legacy <= 20) textSize = Math.round(legacy);
    } catch {}
    // "sun" is refined with the real sunrise/sunset after load; until then day is 7:00–19:00.
    const hour = new Date().getHours();
    const theme = preference === "system" ? (telegramTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) : preference === "sun" ? (hour >= 7 && hour < 19 ? "light" : "dark") : preference;
    root.dataset.themePreference = preference;
    root.dataset.theme = theme;
    root.style.setProperty("--reading-size", textSize + "px");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#100817" : "#f4ead6");
  } catch {}
})();`;
