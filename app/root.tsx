import {env} from "cloudflare:workers";
import { useEffect, useRef } from "react";
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
import { CandleLoader } from "./components/candle-loader";
import "./app.css";

const initialThemeScript = `(() => {
  try {
    const saved = localStorage.getItem("library-theme-v1");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    const dark = saved === "dark" || (saved !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#100817" : "#f2ebf4");
  } catch {}
})();`;

export async function loader({request}: Route.LoaderArgs) {
  const telegramAdmin = await getOptionalTelegramAdmin(request, env.DB);

  return {
    showAdminLink: Boolean(telegramAdmin || hasAdminNavigationCookie(request)),
  };
}

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
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
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: initialThemeScript }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const revalidator = useRevalidator();
  const sessionAttempted = useRef(false);

  useEffect(() => {
    if (sessionAttempted.current) return;
    sessionAttempted.current = true;
    let active = true;
    let webAppForCleanup: TelegramWebApp | null = null;
    const handleSafeArea = () => {
      if (webAppForCleanup) syncTelegramSafeArea(webAppForCleanup);
    };
    void loadTelegramSdk().then(async (webApp) => {
      if (!active || !webApp) return;
      webAppForCleanup = webApp;
      syncTelegramSafeArea(webApp);
      webApp.onEvent?.("safeAreaChanged", handleSafeArea);
      webApp.onEvent?.("contentSafeAreaChanged", handleSafeArea);
      webApp.ready?.();
      webApp.expand?.();
      if (!webApp.initData) return;

      const response = await fetch("/telegram/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      }).catch(() => null);
      if (active && response?.ok) revalidator.revalidate();
    });
    return () => {
      active = false;
      webAppForCleanup?.offEvent?.("safeAreaChanged", handleSafeArea);
      webAppForCleanup?.offEvent?.("contentSafeAreaChanged", handleSafeArea);
    };
  }, [revalidator]);

  return <>
    <Outlet />
    <CandleLoader />
  </>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Սխալ";
  let details = "Տեղի է ունեցել անսպասելի սխալ։";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Սխալ";
    details =
      error.status === 404
        ? "Պահանջված էջը չի գտնվել։"
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
