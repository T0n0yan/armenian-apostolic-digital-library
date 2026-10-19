import {env} from "cloudflare:workers";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/root";
import {getOptionalTelegramAdmin, hasAdminNavigationCookie} from "./auth/admin.server";
import {getOptionalTelegramUser, getTelegramUserCacheScope} from "./auth/telegram-user.server";
import { CandleLoader } from "./components/candle-loader";
import { PageShell, RouteErrorState } from "./components/page-layout";
import { SiteNav } from "./components/site-nav";
import {listActiveCategories} from "./data/categories.server";
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
    let preference = "system";
    let textSize = 16;
    try {
      const value = localStorage.getItem("library-theme-v1");
      if (value === "light" || value === "dark" || value === "sun") preference = value;
      // Reader preferences become data attributes that CSS follows (see app/utils/preferences.ts).
      const prefs = { readingFont: ["library-reading-font", ["book", "serif", "sans"]], titleSize: ["library-title-size", ["medium", "large"]], motion: ["library-motion", ["reduced", "full"]] };
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
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export async function loader({request}: Route.LoaderArgs) {
  const [telegramAdmin, categories, telegramUser] = await Promise.all([
    getOptionalTelegramAdmin(request, env.DB),
    listActiveCategories(env.DB, false, request.signal).catch(() => []),
    getOptionalTelegramUser(request),
  ]);

  const value = {
    showAdminLink: Boolean(telegramAdmin || hasAdminNavigationCookie(request)),
    categories,
    navigationCacheScope: await getTelegramUserCacheScope(telegramUser),
  };
  return value;
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
        <meta name="apple-mobile-web-app-title" content="Հոգևոր ժառանգ." />
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
  const revalidator = useRevalidator();
  const sessionAttempted = useRef(false);

  useLayoutEffect(() => {
    setNavigationCacheScope(loaderData.navigationCacheScope);
  }, [loaderData.navigationCacheScope]);

  // Protects the library's artwork and texts: no "save image" on pictures, and copied text
  // carries its source. (A web page cannot block screenshots; apps like Telegram can.)
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
      const text = window.getSelection()?.toString() ?? "";
      if (text.trim().length < 40 || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", `${text}\n\nԱղբյուր՝ «Հոգևոր ժառանգություն» — ${window.location.href}`);
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    return () => { document.removeEventListener("contextmenu", onContextMenu); document.removeEventListener("copy", onCopy); };
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
  let message = "Էջը չհաջողվեց բացել";
  let details = "Տեղի է ունեցել ժամանակավոր սխալ։ Փորձիր կրկին։";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Էջը չի գտնվել" : message;
    details =
      error.status === 404
        ? "Պահանջված էջը չի գտնվել։"
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
  }

  return (
    <PageShell>
      <SiteNav />
      <RouteErrorState title={message} description={details} />
    </PageShell>
  );
}
