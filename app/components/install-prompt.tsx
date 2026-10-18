import { ExternalLink, Plus, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import DoveMark from "../assets/dove-mark.png";

const DISMISS_KEY = "library-install-dismissed-at";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 12_000;
/** Dispatched by the menu's "Add to home screen" item; opens the prompt even if it was dismissed. */
export const INSTALL_REQUEST_EVENT = "library:install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type TelegramHomeScreen = {
  initData?: string;
  platform?: string;
  openLink?: (url: string) => void;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (callback: (status: "unsupported" | "unknown" | "added" | "missed") => void) => void;
};

// "open-browser": inside Telegram on a client without home-screen support (iOS), open the page in
// the system browser, where the regular "Add to Home Screen" works.
type Mode = "telegram" | "browser" | "ios" | "manual" | "open-browser";

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function telegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramHomeScreen } }).Telegram?.WebApp;
}

export function isInstalledApp() {
  return typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

// The browser fires beforeinstallprompt once, possibly before React mounts; keep it for later.
let deferredInstall: InstallEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as InstallEvent;
  });
}

/** Which way of adding to the home screen this device supports right now. */
function currentMode(): Mode {
  const telegram = telegramWebApp();
  if (telegram?.initData && telegram.addToHomeScreen && telegram.platform !== "ios") return "telegram";
  if (telegram?.initData) return "open-browser";
  if (deferredInstall) return "browser";
  if (/iphone|ipad|ipod/iu.test(navigator.userAgent)) return "ios";
  return "manual";
}

/**
 * Offers to put the library on the home screen: Telegram's addToHomeScreen inside the Mini App,
 * the browser's install prompt on Chrome/Edge/Android, or step-by-step hints where no install API
 * exists (iOS Safari, other browsers). Shown once after a short visit ("✕" hides it for 30 days)
 * and any time from the menu.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [visible, setVisible] = useState(false);
  // "in" slides the toast up from below the screen; "out" slides it back down before unmounting.
  const [phase, setPhase] = useState<"in" | "out">("in");

  const open = useCallback((next: Mode) => {
    setMode(next);
    setPhase("in");
    setVisible(true);
  }, []);

  useEffect(() => {
    if (isInstalledApp()) return;
    let timer: number | undefined;
    // The Telegram SDK loads asynchronously; give it a moment before deciding.
    const decide = window.setTimeout(() => {
      if (recentlyDismissed()) return;
      const next = currentMode();
      const showSoon = () => { timer = window.setTimeout(() => open(next), SHOW_AFTER_MS); };
      const telegram = telegramWebApp();
      if (next === "telegram" && telegram?.checkHomeScreenStatus) {
        telegram.checkHomeScreenStatus((status) => { if (status === "missed" || status === "unknown") showSoon(); });
      } else if (next === "browser" || next === "ios") {
        showSoon();
      }
    }, 1_500);
    const onRequest = () => {
      const next = currentMode();
      const telegram = telegramWebApp();
      // Some Telegram clients expose addToHomeScreen but cannot do it; ask before offering it.
      if (next === "telegram" && telegram?.checkHomeScreenStatus) {
        let answered = false;
        telegram.checkHomeScreenStatus((status) => { answered = true; open(status === "unsupported" ? "open-browser" : next); });
        window.setTimeout(() => { if (!answered) open(next); }, 600);
      } else {
        open(next);
      }
    };
    window.addEventListener(INSTALL_REQUEST_EVENT, onRequest);
    return () => {
      window.clearTimeout(decide);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(INSTALL_REQUEST_EVENT, onRequest);
    };
  }, [open]);

  const dismiss = useCallback(() => {
    setPhase("out");
    window.setTimeout(() => setVisible(false), 420);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* Private mode: it just shows again. */ }
  }, []);

  const install = useCallback(async () => {
    if (mode === "open-browser") {
      const url = new URL(window.location.href);
      url.hash = "";
      const telegram = telegramWebApp();
      if (telegram?.openLink) telegram.openLink(url.toString());
      else window.open(url.toString(), "_blank", "noopener,noreferrer");
      dismiss();
    } else if (mode === "telegram") {
      telegramWebApp()?.addToHomeScreen?.();
      dismiss();
    } else if (mode === "browser" && deferredInstall) {
      const event = deferredInstall;
      deferredInstall = null;
      await event.prompt();
      await event.userChoice.catch(() => null);
      dismiss();
    }
  }, [dismiss, mode]);

  if (!visible || !mode) return null;
  const canInstall = mode === "telegram" || mode === "browser" || mode === "open-browser";
  return (
    <aside
      className="install-toast fixed right-[calc(var(--tg-inset-right,0px)+88px)] bottom-[calc(var(--tg-inset-bottom,0px)+14px)] left-[calc(var(--tg-inset-left,0px)+12px)] z-40 mx-auto grid max-w-[420px] grid-cols-[44px_1fr_auto] items-center gap-3 rounded-[20px] border border-glass-border bg-[var(--page-bg)] px-3.5 py-3 shadow-[0_18px_50px_rgb(40_20_10/28%)]"
      data-phase={phase}
      role="dialog"
      aria-label="Ավելացնել գլխավոր էկրանին"
    >
      <img className="size-11 object-contain" src={DoveMark} width={44} height={44} alt="" aria-hidden="true" />
      <div className="grid gap-0.5">
        <strong className="text-[13px] leading-tight text-ink">Ավելացրու գլխավոր էկրանին</strong>
        {mode === "ios" ? (
          <span className="text-[11.5px] leading-snug text-muted">
            Սեղմիր <Share aria-label="Share" className="inline size-[13px] align-[-2px] text-gold-bright" />, թերթիր ներքև և ընտրիր «Add to Home Screen» («На экран «Домой»»)
          </span>
        ) : mode === "open-browser" ? (
          <span className="text-[11.5px] leading-snug text-muted">Բացիր բրաուզերում, ապա Share → «Add to Home Screen»</span>
        ) : mode === "manual" ? (
          <span className="text-[11.5px] leading-snug text-muted">Բրաուզերի մենյուում (⋮) ընտրիր «Add to Home screen» կամ «Install»</span>
        ) : (
          <span className="text-[11.5px] leading-snug text-muted">Գրադարանը մեկ սեղմումով՝ ինչպես հավելված</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {canInstall ? (
          <button className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-[11px] border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/16%)] px-3 text-[12px] font-bold text-gold-bright" type="button" onClick={install}>
            {mode === "open-browser" ? <><ExternalLink aria-hidden="true" size={14} /> Բացել</> : <><Plus aria-hidden="true" size={14} /> Ավելացնել</>}
          </button>
        ) : null}
        <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:text-ink" type="button" onClick={dismiss} aria-label="Հետո">
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </aside>
  );
}
