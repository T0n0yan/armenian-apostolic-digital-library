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
import "./app.css";

const initialThemeScript = `(() => {
  try {
    const value = localStorage.getItem("library-theme-v1");
    const preference = value === "light" || value === "dark" || value === "system" ? value : "system";
    const theme = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#100817" : "#f2ebf4");
  } catch {}
})();`;

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
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  viewportHeight?: number;
  viewportStableHeight?: number;
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

function syncTelegramSafeArea(webApp: TelegramWebApp) {
  const root = document.documentElement;
  const safe = webApp.safeAreaInset ?? {};
  const content = webApp.contentSafeAreaInset ?? safe;
  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (typeof safe[side] === "number") {
      root.style.setProperty(`--tg-safe-area-inset-${side}`, `${safe[side]}px`);
    }
    const contentValue = content[side] ?? safe[side];
    if (typeof contentValue === "number") {
      root.style.setProperty(
        `--tg-content-safe-area-inset-${side}`,
        `${contentValue}px`,
      );
    }
  }
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
        <meta name="theme-color" content="#f2ebf4" />
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
      webAppForCleanup?.offEvent?.("themeChanged", handleTheme);
    };
  }, [revalidator]);

  return <>
    <Outlet />
    <CandleLoader />
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
