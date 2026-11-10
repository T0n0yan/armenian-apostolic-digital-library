import { BOOT_SCRIPT } from "./utils/boot-script";
import {env} from "cloudflare:workers";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
  type ShouldRevalidateFunctionArgs,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import {can, getOptionalTelegramAdmin, hasAdminNavigationCookie} from "./auth/admin.server";
import {ADMIN_PERMISSIONS, type AdminPermission} from "./utils/admin-permissions";
import {getOptionalTelegramUser, getTelegramUserCacheScope} from "./auth/telegram-user.server";
import { ReminderError } from "./components/reminder-error";
import { CandleLoader } from "./components/candle-loader";
import { ClientErrorReporter } from "./components/client-error-reporter";
import { PageShell } from "./components/page-layout";
import { RouteErrorPage } from "./components/error-page";
import {listActiveCategories} from "./data/categories.server";
import {contentVersion} from "./data/content-version.server";
import { setRemindersEnabled } from "./utils/reminder-store";
import { setContentVersion, setRootSearchState } from "./utils/search-state";
import {clearNavigationCache, setNavigationCacheScope} from "./utils/navigation-cache";
import { markAppHydrated, setPersonalContext } from "./utils/personal-data";
import {applyThemePreference, readStoredThemePreference} from "./utils/theme";
import {InstallPrompt} from "./components/install-prompt";
import { NavigationProgress } from "./components/navigation-progress";
import { ChurchNudge } from "./components/church-nudge";
import { HelpOnboarding } from "./components/help-onboarding";
import { PrivateChatPresence } from "./components/private-chat-presence";
import { chatParticipant, chatUnread } from "./data/private-chat.server";
import { PlaceTracker } from "./components/continue-reading";
import { clearPersonalStorage } from "./utils/personal-storage";
import "./app.css";

// Այս շերտերը էջի առաջին պատկերին պետք չեն. բեռնվում են առանձին ֆայլով, երբ բրաուզերը ազատ է
// (հին հեռախոսներում էջը ավելի շուտ է բացվում)։
const GlossaryLayer = lazy(() => import("./components/glossary-layer").then((m) => ({ default: m.GlossaryLayer })));
const HighlightLayer = lazy(() => import("./components/highlight-layer").then((m) => ({ default: m.HighlightLayer })));
const ReminderAlarm = lazy(() => import("./components/reminder-alarm").then((m) => ({ default: m.ReminderAlarm })));
const SundayPrompt = lazy(() => import("./components/sunday-prompt").then((m) => ({ default: m.SundayPrompt })));

/** true՝ երբ էջը բացվել է և բրաուզերը ազատ է (առավելագույնը 2.5 վ հետո)։ */
function useIdleReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);
  return ready;
}

// Runs before paint. Inside Telegram the launch hash carries Telegram's theme, which already follows
// the phone's light/dark setting; elsewhere the browser's prefers-color-scheme does.

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico?v=2", sizes: "any" },
  { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64.png?v=2" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
  { rel: "manifest", href: "/manifest.webmanifest?v=2" },
];

export async function loader({request}: Route.LoaderArgs) {
  // Բազայի հարցումները զուգահեռ՝ որ էջի առաջին պատասխանը արագ գա։
  const version = contentVersion(env.DB).catch(() => "0");
  const [telegramAdmin, categories, telegramUser] = await Promise.all([
    getOptionalTelegramAdmin(request, env.DB),
    listActiveCategories(env.DB, false, request.signal).catch(() => []),
    getOptionalTelegramUser(request),
  ]);

  // Անձնական չատ (/namak). մենյուի թաքուն կետը՝ միայն երկու կողմին, չկարդացվածների թվով։
  const [chat, navigationCacheScope] = await Promise.all([
    telegramUser ? chatParticipant(request).catch(() => null) : null,
    getTelegramUserCacheScope(telegramUser),
  ]);

  const value = {
    // «Կառավարում» is the owner's alone; other admins get links to what they were allowed.
    // The cookie stands for a Cloudflare Access sign-in only; a reader signed in with another account doesn't get the link.
    showAdminLink: Boolean(telegramAdmin?.owner || (!telegramUser && hasAdminNavigationCookie(request))),
    isAdmin: can(telegramAdmin, "copy"),
    adminPermissions: telegramAdmin ? (telegramAdmin.owner ? Object.keys(ADMIN_PERMISSIONS) as AdminPermission[] : telegramAdmin.permissions) : [],
    signedIn: Boolean(telegramUser),
    privateChat: chat ? { unread: await chatUnread(chat.side), side: chat.side } : null,
    // Shown with "Ելք" at the bottom of the menu.
    account: telegramUser ? { name: telegramUser.displayName, source: telegramUser.source } : null,
    categories,
    navigationCacheScope,
    // Phones keep pages and the title index until this changes (public/sw.js, utils/local-search.ts).
    contentVersion: await version,
  };
  return value;
}

/**
 * The root data (sections, sign-in state) is the same on every page, so moving between pages
 * doesn't reload it. It reloads after a form is sent (sign in/out, saving) or when a page asks
 * for it explicitly (revalidate after the Telegram sign-in), which keeps the URL the same.
 */
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  // A search form (GET) is only a move to another address; it must not cost a second request.
  if ((formMethod && formMethod.toUpperCase() !== "GET") || currentUrl.href === nextUrl.href) return defaultShouldRevalidate;
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
 * Whether Telegram's Close/⋯ buttons float over the top of the page. Telegram says so with
 * isFullscreen; when it opens the page under its own header (the usual bot button) that is false
 * and the page needs no room at the top. Older clients without the flag count as fullscreen only
 * when the page fills the whole screen.
 */
function isTelegramFullscreen(webApp: TelegramWebApp) {
  if (typeof webApp.isFullscreen === "boolean") return webApp.isFullscreen;
  const phone = webApp.platform === "android" || webApp.platform === "ios";
  return phone && window.innerHeight >= window.screen.height - 32;
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
    // A little air under those buttons, so the page's own back link and search don't touch them.
    if (side === "top" && fullscreen) contentValue += 4;
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
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
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
  // Անձնական չատում ոչ մի պատուհան չի բացվում (կիրակնօրյա հարց, ուղեցույց, «Ավելացնել էկրանին»…)։
  const quiet = useLocation().pathname === "/namak";
  // Մոմի ներածությունը՝ միայն երբ այցը սկսվում է գլխավոր էջից. որոնումից կամ հղումով ներքին էջ
  // (սաղմոս, աղոթք) եկողը անմիջապես տեսնում է իր փնտրածը։
  const [introHere] = useState(useLocation().pathname === "/");
  const idle = useIdleReady();
  // Guests have no reminders: don't ask the server for them (set before children's effects run).
  setRemindersEnabled(Boolean(loaderData.signedIn), loaderData.navigationCacheScope);
  // Մուտք չգործածի մոտ այս սարքում անձնական ոչինչ չի մնում (վերջին կարդացածը, սմայլիկները…)։
  useEffect(() => { if (!loaderData.signedIn) clearPersonalStorage({ session: false }); }, [loaderData.signedIn]);
  // The phone's title search and page keeping follow the content version (utils/local-search.ts).
  setContentVersion(loaderData.contentVersion);
  setRootSearchState({ signedIn: Boolean(loaderData.signedIn), categories: loaderData.categories });
  // Էջերի անձնական մասը բերվում է առանձին (utils/personal-data.ts)՝ միայն մուտք գործածի կամ ադմինի համար։
  setPersonalContext({ signedIn: Boolean(loaderData.signedIn), admin: loaderData.adminPermissions.length > 0 || loaderData.showAdminLink });
  const revalidator = useRevalidator();
  const sessionAttempted = useRef(false);

  useLayoutEffect(() => {
    setNavigationCacheScope(loaderData.navigationCacheScope);
  }, [loaderData.navigationCacheScope]);
  useEffect(() => { markAppHydrated(); }, []);

  // Tells the site once that this device has visited, for the admin's visitor list. A random id
  // stays in the browser; nothing else is sent. Once per device: each request costs the free plan.
  useEffect(() => {
    let visitorId = "";
    try {
      if (localStorage.getItem("library-presence-sent") === "1") return;
      visitorId = localStorage.getItem("library-visitor") ?? "";
      if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem("library-visitor", visitorId); }
    } catch { return; }
    const agent = navigator.userAgent;
    const platform = /iPhone|iPad|iPod/u.test(agent) || (/Macintosh/u.test(agent) && navigator.maxTouchPoints > 1) ? "ios"
      : /Android/u.test(agent) ? "android" : /Windows/u.test(agent) ? "windows" : /Macintosh|Mac OS X/u.test(agent) ? "macos" : /Linux|CrOS/u.test(agent) ? "linux" : "other";
    const inTelegram = Boolean((window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
    void fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId, platform, inTelegram }), keepalive: true })
      .then((response) => { if (response.ok) localStorage.setItem("library-presence-sent", "1"); })
      .catch(() => null);
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

  // Check freshness on return to an open tab; never wake a background tab to poll.
  useEffect(() => {
    let lastChecked = Date.now();
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastChecked < 300_000) return;
      lastChecked = Date.now();
      const response = await fetch("/api/content-version").catch(() => null);
      const data = response?.ok ? await response.json().catch(() => null) as { version?: string } | null : null;
      if (active && data?.version && data.version !== loaderData.contentVersion) {
        clearNavigationCache();
        void revalidator.revalidate();
      }
    };
    document.addEventListener("visibilitychange", check);
    return () => { active = false; document.removeEventListener("visibilitychange", check); };
  }, [loaderData.contentVersion, revalidator]);

  // The service worker answers page data it already has while the content version stays the same.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const tell = () => navigator.serviceWorker.controller?.postMessage({ type: "content-version", version: loaderData.contentVersion });
    tell();
    navigator.serviceWorker.addEventListener("controllerchange", tell);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", tell);
  }, [loaderData.contentVersion]);

  // The service worker keeps visited pages and pictures for slow or missing connections.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // The "sun" theme turns at the real sunrise and sunset; check again every few minutes. "system"
  // follows the phone switching between light and dark while the page is open.
  useEffect(() => {
    const refresh = () => { if (readStoredThemePreference() === "sun") applyThemePreference("sun"); };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const followPhone = () => { if (readStoredThemePreference() === "system") applyThemePreference("system"); };
    scheme.addEventListener?.("change", followPhone);
    return () => { window.clearInterval(timer); scheme.removeEventListener?.("change", followPhone); };
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
    {introHere && <CandleLoader />}
    <ClientErrorReporter />
    {!quiet && <InstallPrompt />}
    <ReminderError />
    <NavigationProgress />
    {!quiet && <ChurchNudge />}
    {!quiet && <HelpOnboarding />}
    <PlaceTracker />
    <PrivateChatPresence />
    {idle && <Suspense fallback={null}>
      <ReminderAlarm />
      <GlossaryLayer />
      <HighlightLayer />
      {!quiet && <SundayPrompt />}
    </Suspense>}
  </>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (import.meta.env.DEV && error instanceof Error) console.error(error);
  return <RouteErrorPage error={error} />;
}
