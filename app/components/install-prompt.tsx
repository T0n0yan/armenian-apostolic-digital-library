import { ArrowDown, Plus, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import DoveMark from "../assets/dove-mark.png";

const DISMISS_KEY = "library-install-dismissed-at";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 12_000;
/** Added to the address when Telegram opens the site in the browser: the prompt shows at once there. */
const INSTALL_PARAM = "install";
/** Dispatched by the menu's "Add to home screen" item; opens the prompt even if it was dismissed. */
export const INSTALL_REQUEST_EVENT = "library:install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type TelegramWebApp = {
  initData?: string;
  platform?: string;
  openLink?: (url: string, options?: { try_browser?: string; try_instant_view?: boolean }) => void;
};

// "browser": the browser's own install dialog (Chrome, Edge, Samsung). "ios": Safari, which has no
// install API, so a one-line hint and an arrow to its Share button. "manual": other browsers.
// "open-browser": inside Telegram, open the site in the phone's browser and finish there (Telegram's
// own shortcut would add the bot, not the site). "open-safari": an iPhone app's own browser
// (Instagram, Facebook…), which cannot add to the home screen.
type Mode = "browser" | "ios" | "manual" | "open-browser" | "open-safari";

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function telegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function isInstalledApp() {
  return typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

// The browser fires beforeinstallprompt once, possibly before React mounts; keep it for later.
let deferredInstall: InstallEvent | null = null;
const INSTALL_READY_EVENT = "library:install-ready";
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as InstallEvent;
    window.dispatchEvent(new Event(INSTALL_READY_EVENT));
  });
}

function isAppleDevice() {
  return /iphone|ipad|ipod/iu.test(navigator.userAgent);
}

/** Instagram, Facebook, TikTok… open links in their own browser, which has no «Add to Home Screen». */
function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|LinkedInApp|Twitter|GSA\//u.test(navigator.userAgent);
}

/** Which way of adding to the home screen this device supports right now. */
function currentMode(): Mode {
  if (telegramWebApp()?.initData) return "open-browser";
  if (deferredInstall) return "browser";
  if (isAppleDevice()) return isInAppBrowser() ? "open-safari" : "ios";
  return "manual";
}

/**
 * Offers to put the library on the home screen in as few taps as the phone allows: the browser's
 * install dialog where there is one, the site opened in the browser from Telegram (where the prompt
 * shows again at once), a one-line hint on iPhone Safari. Shown once after a short visit ("✕" hides
 * it for 30 days) and any time from the menu.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"in" | "out">("in");

  const open = useCallback((next: Mode) => {
    setMode(next);
    setPhase("in");
    setVisible(true);
  }, []);

  useEffect(() => {
    if (isInstalledApp()) return;
    let timer: number | undefined;
    // Arrived from Telegram's «Ավելացնել»: show at once, and drop the flag from the address.
    const url = new URL(window.location.href);
    const requested = url.searchParams.has(INSTALL_PARAM);
    if (requested) {
      url.searchParams.delete(INSTALL_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
    // The Telegram SDK and Chrome's install event arrive a moment after load; wait before deciding.
    const decide = window.setTimeout(() => {
      const next = currentMode();
      if (requested) return open(next);
      if (recentlyDismissed() || next === "manual") return;
      timer = window.setTimeout(() => open(currentMode()), SHOW_AFTER_MS);
    }, requested ? 800 : 1_500);
    const onRequest = () => open(currentMode());
    // Chrome may allow installing only after the hint is already on screen: offer the button then.
    const onReady = () => setMode((current) => (current === "manual" ? "browser" : current));
    window.addEventListener(INSTALL_REQUEST_EVENT, onRequest);
    window.addEventListener(INSTALL_READY_EVENT, onReady);
    return () => {
      window.clearTimeout(decide);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(INSTALL_REQUEST_EVENT, onRequest);
      window.removeEventListener(INSTALL_READY_EVENT, onReady);
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
      url.searchParams.set(INSTALL_PARAM, "1");
      const telegram = telegramWebApp();
      if (telegram?.openLink) telegram.openLink(url.toString(), { try_browser: telegram.platform === "ios" ? "safari" : "chrome", try_instant_view: false });
      else window.open(url.toString(), "_blank", "noopener,noreferrer");
      dismiss();
    } else if (mode === "open-safari") {
      // iOS 17+ opens x-safari-https://… in Safari.
      window.location.href = `x-safari-${window.location.href.split("#")[0]}`;
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
  const hasButton = mode === "browser" || mode === "open-browser" || mode === "open-safari";
  const iphone = mode === "ios" && /iphone|ipod/iu.test(navigator.userAgent);
  return (
    <>
      <aside
        className="top-toast fixed top-[calc(var(--tg-inset-top,0px)+12px)] right-[calc(var(--tg-inset-right,0px)+12px)] left-[calc(var(--tg-inset-left,0px)+12px)] z-[65] mx-auto grid max-w-[440px] gap-3 rounded-[20px] border border-glass-border bg-[var(--page-bg)] p-3.5 shadow-[0_18px_50px_rgb(40_20_10/28%)]"
        data-phase={phase}
        role="dialog"
        aria-label="Ավելացնել գլխավոր էկրանին"
      >
        <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3">
          <img className="size-10 object-contain" src={DoveMark} width={40} height={40} alt="" aria-hidden="true" />
          <strong className="text-[14.5px] leading-tight text-ink">Ավելացրեք գլխավոր էկրանին</strong>
          <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:text-ink" type="button" onClick={dismiss} aria-label="Հետո">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
        {mode === "ios" ? (
          <p className="m-0 text-center text-[13px] text-ink">
            Հպեք <Share aria-label="Կիսվել" className="inline size-[15px] align-[-2px] text-gold-bright" /> → «<strong>Add to Home Screen</strong>»
          </p>
        ) : mode === "manual" ? (
          <p className="m-0 text-center text-[13px] text-ink">Հպեք <strong>⋮</strong> → «<strong>Add to Home screen</strong>»</p>
        ) : null}
        {hasButton ? (
          <button className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[13px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[14px] font-bold text-[#2a1708] shadow-[0_6px_16px_rgb(150_100_30/22%)]" type="button" onClick={install}>
            <Plus aria-hidden="true" size={16} /> {mode === "open-safari" ? "Բացել Safari-ում" : "Ավելացնել"}
          </button>
        ) : null}
      </aside>
      {iphone && phase === "in" ? (
        // Points at Safari's Share button in the bottom bar.
        <span className="install-arrow pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+58px)] left-1/2 z-[64] grid place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] p-2 text-[#2a1708] shadow-[0_8px_20px_rgb(150_100_30/35%)]" aria-hidden="true">
          <ArrowDown size={22} strokeWidth={2.4} />
        </span>
      ) : null}
    </>
  );
}
