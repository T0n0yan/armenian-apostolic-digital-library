import {env} from "cloudflare:workers";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/root";
import {getOptionalTelegramAdmin, hasAdminNavigationCookie} from "./auth/admin.server";
import {getOptionalTelegramUser, getTelegramUserCacheScope} from "./auth/telegram-user.server";
import { CandleLoader } from "./components/candle-loader";
import { PageShell } from "./components/page-layout";
import { RouteErrorPage } from "./components/error-page";
import {listActiveCategories} from "./data/categories.server";
import { setRemindersEnabled } from "./utils/reminder-store";
import {clearNavigationCache, setNavigationCacheScope} from "./utils/navigation-cache";
import {applyThemePreference, readStoredThemePreference} from "./utils/theme";
import {InstallPrompt} from "./components/install-prompt";
import { ReminderAlarm } from "./components/reminder-alarm";
import { NavigationProgress } from "./components/navigation-progress";
import "./app.css";

// Runs before paint. Inside Telegram the launch hash carries Telegram's theme, which already follows
// the phone's light/dark setting; elsewhere the browser's prefers-color-scheme does.
const initialThemeScript = `(() => {
  try {
    const root = document.documentElement;
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
    let preference = "system";
    let textSize = 16;
    try {
      const value = localStorage.getItem("library-theme-v1");
      if (value === "light" || value === "dark" || value === "sun") preference = value;
      // Reader preferences become data attributes that CSS follows (see app/utils/preferences.ts).
      const prefs = { readingFont: ["library-reading-font", ["book", "serif", "sans"]], titleSize: ["library-title-size", ["medium", "large"]], motion: ["library-motion", ["reduced", "full"]], devMode: ["library-dev-mode", ["on"]] };
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

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico?v=2", sizes: "any" },
  { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64.png?v=2" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
  { rel: "manifest", href: "/manifest.webmanifest?v=2" },
];

export async function loader({request}: Route.LoaderArgs) {
  const [telegramAdmin, categories, telegramUser] = await Promise.all([
    getOptionalTelegramAdmin(request, env.DB),
    listActiveCategories(env.DB, false, request.signal).catch(() => []),
    getOptionalTelegramUser(request),
  ]);

  const value = {
    showAdminLink: Boolean(telegramAdmin || hasAdminNavigationCookie(request)),
    isAdmin: Boolean(telegramAdmin),
    signedIn: Boolean(telegramUser),
    // Shown with "Ելք" at the bottom of the menu.
    account: telegramUser ? { name: telegramUser.displayName, source: telegramUser.source } : null,
    categories,
    navigationCacheScope: await getTelegramUserCacheScope(telegramUser),
  };
  return value;
}

/**
 * The root data (sections, sign-in state) is the same on every page, so moving between pages
 * doesn't reload it. It reloads after a form is sent (sign in/out, saving) or when a page asks
 * for it explicitly (revalidate after the Telegram sign-in), which keeps the URL the same.
 */
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod || currentUrl.href === nextUrl.href) return defaultShouldRevalidate;
  return false;
}

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  isFullscreen?: boolean;
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  viewportHeight?: number;
  viewportStableHeight?: number;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};

type TelegramInset = { top?: number; right?: number; bottom?: number; left?: number };

type TelegramWindow = Window & {
  Telegram?: { WebApp?: TelegramWebApp };
};

let telegramSdkPromise: Promise<TelegramWebApp | null> | null = null;

function loadTelegramSdk() {
  if (telegramSdkPromise) return telegramSdkPromise;
  telegramSdkPromise = new Promise((resolve) => {
    const telegramWindow = window as TelegramWindow;
    if (telegramWindow.Telegram?.WebApp) {
      resolve(telegramWindow.Telegram.WebApp);
      return;
    }

    const source = "https://telegram.org/js/telegram-web-app.js?64";
    const existing = window.document.querySelector<HTMLScriptElement>(
      `script[src="${source}"]`,
    );
    const script = existing ?? window.document.createElement("script");
    const finish = () => resolve(telegramWindow.Telegram?.WebApp ?? null);
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    if (!existing) {
      script.src = source;
      script.async = true;
      window.document.head.appendChild(script);
    }
  });
  return telegramSdkPromise;
}

/**
 * Whether Telegram's Close/⋯ buttons float over the top of the page. On phones the library's bot
 * opens fullscreen, but some Android clients report neither isFullscreen nor a content inset, so a
 * phone Mini App counts as fullscreen unless Telegram reports a header of its own.
 */
function isTelegramFullscreen(webApp: TelegramWebApp) {
  if (webApp.isFullscreen) return true;
  return webApp.platform === "android" || webApp.platform === "ios";
}

/** `?tgdebug` shows what Telegram reports about the screen, to diagnose layout on a device. */
function showTelegramDebug(webApp: TelegramWebApp) {
  if (!new URLSearchParams(window.location.search).has("tgdebug")) return;
  const panel = document.getElementById("tg-debug") ?? document.body.appendChild(Object.assign(document.createElement("pre"), { id: "tg-debug" }));
  panel.setAttribute("style", "position:fixed;left:8px;right:8px;bottom:90px;z-index:99999;margin:0;padding:8px;border-radius:10px;background:rgb(0 0 0/80%);color:#fff;font:11px/1.4 monospace;white-space:pre-wrap");
  panel.textContent = JSON.stringify({
    platform: webApp.platform, isFullscreen: webApp.isFullscreen, safe: webApp.safeAreaInset, content: webApp.contentSafeAreaInset,
    inner: [window.innerWidth, window.innerHeight], screen: [window.screen.width, window.screen.height],
    inset: getComputedStyle(document.documentElement).getPropertyValue("--tg-inset-top"),
  }, null, 1);
}

function syncTelegramSafeArea(webApp: TelegramWebApp) {
  const root = document.documentElement;
  const safe = webApp.safeAreaInset ?? {};
  const content = webApp.contentSafeAreaInset ?? {};
  const fullscreen = isTelegramFullscreen(webApp);
  root.dataset.tgFullscreen = fullscreen ? "true" : "false";
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const safeValue = typeof safe[side] === "number" ? safe[side] : 0;
    let contentValue = typeof content[side] === "number" ? content[side] : 0;
    // Some Android clients report no content inset in fullscreen although Telegram's Close and ⋯
    // buttons float over the top of the page; keep the page clear of them anyway.
    if (side === "top" && fullscreen && contentValue < 40) contentValue = 52;
    root.style.setProperty(`--tg-safe-area-inset-${side}`, `${safeValue}px`);
    root.style.setProperty(`--tg-content-safe-area-inset-${side}`, `${contentValue}px`);
    // In fullscreen Mini Apps the content inset (Telegram's Close/⋯ buttons) is measured from the
    // device safe area (status bar, notch), so the page must clear both.
    root.style.setProperty(`--tg-inset-${side}`, `${safeValue + contentValue}px`);
  }
  showTelegramDebug(webApp);
  if (typeof webApp.viewportHeight === "number") {
    root.style.setProperty("--tg-viewport-height", `${webApp.viewportHeight}px`);
  }
  if (typeof webApp.viewportStableHeight === "number") {
    root.style.setProperty("--tg-viewport-stable-height", `${webApp.viewportStableHeight}px`);
  }
  const background = webApp.themeParams?.bg_color;
  const text = webApp.themeParams?.text_color;
  if (background) root.style.setProperty("--tg-theme-bg", background);
  if (text) root.style.setProperty("--tg-theme-text", text);
}

function syncTelegramTheme(webApp: TelegramWebApp) {
  // telegram-web-app.js can expose a stub in ordinary Safari/Chrome. Only a
  // validated WebView context may influence the system preference.
  if (!webApp.initData || (webApp.colorScheme !== "light" && webApp.colorScheme !== "dark")) return;
  const root = document.documentElement;
  root.dataset.telegramContext = "true";
  root.dataset.telegramTheme = webApp.colorScheme;
  applyThemePreference(readStoredThemePreference());
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hy" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Հոգևոր ժառանգություն" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#f4ead6" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: initialThemeScript }} />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={({ pathname, search }) => `${pathname}${search}`} />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  // Guests have no reminders: don't ask the server for them (set before children's effects run).
  setRemindersEnabled(Boolean(loaderData.signedIn));
  const revalidator = useRevalidator();
  const sessionAttempted = useRef(false);

  useLayoutEffect(() => {
    setNavigationCacheScope(loaderData.navigationCacheScope);
  }, [loaderData.navigationCacheScope]);

  // Protects the library's artwork: holding a link, card or picture opens no system menu
  // (Android's link menu, Telegram's "Open in…" popup, "save image"). The reading text itself
  // (.reading-body) can be selected and copied, and copied text carries its source. Admins can
  // lift the rest with developer mode. (Screenshots can't be blocked.)
  useEffect(() => {
    const devMode = () => document.documentElement.dataset.devMode === "on";
    const isField = (target: EventTarget | null) => Boolean((target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']"));
    // Plain reading text (not its links, pictures or the player inside it).
    const isReadingText = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : (target as Node | null)?.parentElement ?? null;
      return Boolean(element?.closest?.(".reading-body") && !element.closest("a, img, video, audio, button"));
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!devMode() && !isField(event.target) && !isReadingText(event.target)) event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
      // Copies the site makes itself (a verse, a link) and form fields keep their own text.
      if (devMode() || isField(event.target)) return;
      const text = window.getSelection()?.toString() ?? "";
      if (text.trim().length < 15 || !event.clipboardData) return;
      // The page's title first, then the words, then the link: "Սաղմոս 25" / text / https://….
      const title = document.querySelector("main h1")?.textContent?.trim();
      event.clipboardData.setData("text/plain", `${title ? `${title}\n` : ""}${text.trim()}\n\n«Հոգևոր ժառանգություն» — ${window.location.href}`);
      event.preventDefault();
    };
    // No selection starts outside form fields and the reading text (iOS can still try on a long press).
    const onSelectStart = (event: Event) => {
      if (!devMode() && !isField(event.target) && !isReadingText(event.target)) event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("selectstart", onSelectStart);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("selectstart", onSelectStart);
    };
  }, []);

  // Tells the site this device has a page open (every 5 minutes while visible), for the admin's
  // "online now" and device numbers. A random id stays in the browser; nothing else is sent.
  useEffect(() => {
    let visitorId = "";
    try {
      visitorId = localStorage.getItem("library-visitor") ?? "";
      if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem("library-visitor", visitorId); }
    } catch { visitorId = crypto.randomUUID(); }
    const agent = navigator.userAgent;
    const platform = /iPhone|iPad|iPod/u.test(agent) || (/Macintosh/u.test(agent) && navigator.maxTouchPoints > 1) ? "ios"
      : /Android/u.test(agent) ? "android" : /Windows/u.test(agent) ? "windows" : /Macintosh|Mac OS X/u.test(agent) ? "macos" : /Linux|CrOS/u.test(agent) ? "linux" : "other";
    const inTelegram = Boolean((window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
    const send = () => {
      if (document.visibilityState !== "visible") return;
      // At most once in 5 minutes, also across page reloads and new tabs.
      try {
        const last = Number(localStorage.getItem("library-presence-at") ?? 0);
        if (Date.now() - last < 290_000) return;
        localStorage.setItem("library-presence-at", String(Date.now()));
      } catch { /* storage blocked: send anyway */ }
      void fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId, platform, inTelegram }), keepalive: true }).catch(() => null);
    };
    send();
    const timer = window.setInterval(send, 300_000);
    document.addEventListener("visibilitychange", send);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", send); };
  }, []);

  // Load the bird-letter font for prayer initials once the page has settled, so opening a prayer
  // shows the ornate letter at once instead of swapping it in.
  useEffect(() => {
    const warm = () => { document.fonts?.load('1em "Trchnatar Birds Color"', "Ա").catch(() => undefined); };
    const idle = (window as { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500);
    return () => { if (!idle) window.clearTimeout(handle); };
  }, []);

  // After a new deploy, an open page may ask for scripts that no longer exist; reload it once
  // instead of leaving it broken.
  useEffect(() => {
    const KEY = "library-reloaded-for-update";
    const reload = () => {
      try { if (sessionStorage.getItem(KEY) === "1") return; sessionStorage.setItem(KEY, "1"); } catch { /* reload anyway */ }
      window.location.reload();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = String((event.reason as { message?: string } | null)?.message ?? event.reason ?? "");
      if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/iu.test(message) && /module|import/iu.test(message)) reload();
    };
    window.addEventListener("vite:preloadError", reload);
    window.addEventListener("unhandledrejection", onRejection);
    const clear = window.setTimeout(() => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }, 10_000);
    return () => { window.removeEventListener("vite:preloadError", reload); window.removeEventListener("unhandledrejection", onRejection); window.clearTimeout(clear); };
  }, []);

  // The service worker keeps visited pages and pictures for slow or missing connections.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // The "sun" theme turns at the real sunrise and sunset; check again every few minutes.
  useEffect(() => {
    const refresh = () => { if (readStoredThemePreference() === "sun") applyThemePreference("sun"); };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sessionAttempted.current) return;
    sessionAttempted.current = true;
    let active = true;
    let webAppForCleanup: TelegramWebApp | null = null;
    const handleSafeArea = () => {
      if (webAppForCleanup) syncTelegramSafeArea(webAppForCleanup);
    };
    const handleTheme = () => {
      if (webAppForCleanup) syncTelegramTheme(webAppForCleanup);
    };
    // Ordinary browsers never load Telegram's script (it logs on every page and costs a request).
    if (document.documentElement.dataset.inTelegram !== "true") return;
    void loadTelegramSdk().then(async (webApp) => {
      if (!active || !webApp) return;
      webAppForCleanup = webApp;
      syncTelegramSafeArea(webApp);
      syncTelegramTheme(webApp);
      webApp.onEvent?.("safeAreaChanged", handleSafeArea);
      webApp.onEvent?.("contentSafeAreaChanged", handleSafeArea);
      webApp.onEvent?.("viewportChanged", handleSafeArea);
      webApp.onEvent?.("fullscreenChanged", handleSafeArea);
      webApp.onEvent?.("themeChanged", handleTheme);
      webApp.ready?.();
      webApp.expand?.();
      if (!webApp.initData) return;

      const response = await fetch("/telegram/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      }).catch(() => null);
      if (active && response?.ok) {
        clearNavigationCache();
        revalidator.revalidate();
      }
    });
    return () => {
      active = false;
      webAppForCleanup?.offEvent?.("safeAreaChanged", handleSafeArea);
      webAppForCleanup?.offEvent?.("contentSafeAreaChanged", handleSafeArea);
      webAppForCleanup?.offEvent?.("viewportChanged", handleSafeArea);
      webAppForCleanup?.offEvent?.("fullscreenChanged", handleSafeArea);
      webAppForCleanup?.offEvent?.("themeChanged", handleTheme);
    };
  }, [revalidator]);

  return <>
    <Outlet />
    <CandleLoader />
    <InstallPrompt />
    <ReminderAlarm />
    <NavigationProgress />
  </>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (import.meta.env.DEV && error instanceof Error) console.error(error);
  return <RouteErrorPage error={error} />;
}
