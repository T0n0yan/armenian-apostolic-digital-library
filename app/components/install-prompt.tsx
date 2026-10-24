import { ArrowDown, ExternalLink, Plus, Share, X } from "lucide-react";
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
  openLink?: (url: string, options?: { try_browser?: string; try_instant_view?: boolean }) => void;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (callback: (status: "unsupported" | "unknown" | "added" | "missed") => void) => void;
};

// "open-browser": inside Telegram on a client without home-screen support (iOS), open the page in
// the system browser, where the regular "Add to Home Screen" works. "open-safari": an app's own
// browser on iPhone (Instagram, Facebook…), which cannot add to the home screen; Safari can.
type Mode = "telegram" | "browser" | "ios" | "manual" | "open-browser" | "open-safari";

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

function isAppleDevice() {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/iu.test(navigator.userAgent);
}

/** Instagram, Facebook, TikTok… open links in their own browser, which has no «Add to Home Screen». */
function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|LinkedInApp|Twitter|GSA\//u.test(navigator.userAgent);
}

/** Which way of adding to the home screen this device supports right now. */
function currentMode(): Mode {
  const telegram = telegramWebApp();
  // Inside Telegram the site is installed from the phone's browser, not from Telegram itself.
  if (telegram?.initData) return "open-browser";
  if (deferredInstall) return "browser";
  if (isAppleDevice()) return isInAppBrowser() ? "open-safari" : "ios";
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
      const showSoon = (mode: Mode) => { timer = window.setTimeout(() => open(mode), SHOW_AFTER_MS); };
      const telegram = telegramWebApp();
      if (next === "open-browser" && telegram?.checkHomeScreenStatus && telegram.addToHomeScreen) {
        // One tap inside Telegram where it can; already added: say nothing; else via the browser.
        telegram.checkHomeScreenStatus((status) => {
          if (status === "missed") showSoon("telegram");
          else if (status !== "added") showSoon("open-browser");
        });
      } else if (next === "browser" || next === "ios" || next === "open-safari") {
        showSoon(next);
      }
    }, 1_500);
    const onRequest = () => {
      const next = currentMode();
      const telegram = telegramWebApp();
      // Some Telegram clients expose addToHomeScreen but cannot do it; ask before offering it.
      if (next === "open-browser" && telegram?.checkHomeScreenStatus && telegram.addToHomeScreen) {
        let answered = false;
        telegram.checkHomeScreenStatus((status) => { answered = true; open(status === "missed" ? "telegram" : "open-browser"); });
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
      if (telegram?.openLink) telegram.openLink(url.toString(), { try_browser: telegram.platform === "ios" ? "safari" : "chrome", try_instant_view: false });
      else window.open(url.toString(), "_blank", "noopener,noreferrer");
      dismiss();
    } else if (mode === "open-safari") {
      // iOS 17+ opens x-safari-https://… in Safari.
      window.location.href = `x-safari-${window.location.href.split("#")[0]}`;
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
  const canInstall = mode === "telegram" || mode === "browser" || mode === "open-browser" || mode === "open-safari";
  const iphone = mode === "ios" && /iphone|ipod/iu.test(navigator.userAgent);
  return (
    <>
    <aside
      className="top-toast fixed top-[calc(var(--tg-inset-top,0px)+12px)] right-[calc(var(--tg-inset-right,0px)+12px)] left-[calc(var(--tg-inset-left,0px)+12px)] z-[65] mx-auto grid max-w-[440px] gap-3 rounded-[20px] border border-glass-border bg-[var(--page-bg)] p-3.5 shadow-[0_18px_50px_rgb(40_20_10/28%)]"
      data-phase={phase}
      role="dialog"
      aria-label="Ավելացնել գլխավոր էկրանին"
    >
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
        <img className="size-11 object-contain" src={DoveMark} width={44} height={44} alt="" aria-hidden="true" />
        <div className="grid min-w-0 gap-0.5">
          <strong className="text-[14px] leading-tight text-ink">Ավելացրեք գլխավոր էկրանին</strong>
          <span className="text-[12px] leading-snug text-muted">Գրադարանը մեկ հպումով՝ ինչպես հավելված</span>
        </div>
        <button className="grid size-9 cursor-pointer place-items-center self-start rounded-full border-0 bg-transparent text-muted hover:text-ink" type="button" onClick={dismiss} aria-label="Հետո">
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      {mode === "ios" ? (
        // Apple lets no site open «Add to Home Screen» itself: three short steps, with an arrow to the button.
        <ol className="m-0 grid list-none gap-1.5 rounded-[12px] bg-subtle px-3 py-2.5 text-[12.5px] leading-snug text-ink">
          <li><strong className="text-gold-bright">1.</strong> Հպեք <Share aria-label="Կիսվել" className="inline size-[15px] align-[-2px] text-gold-bright" /> կոճակին {iphone ? "ներքևում" : "վերևում"} (եթե չի երևում՝ «⋯»-ի մեջ)</li>
          <li><strong className="text-gold-bright">2.</strong> Ընտրեք «<strong>Add to Home Screen</strong>» <Plus aria-hidden="true" className="inline size-[13px] align-[-2px]" /></li>
          <li><strong className="text-gold-bright">3.</strong> Հպեք «<strong>Add</strong>»</li>
        </ol>
      ) : mode === "open-browser" ? (
        <p className="m-0 rounded-[12px] bg-subtle px-3 py-2 text-[12.5px] leading-snug text-ink">
          Telegram-ից դա հնարավոր չէ, իսկ բրաուզերից՝ այո։ Հպեք ներքևի կոճակին, կայքը կբացվի {isAppleDevice() ? "Safari-ում" : "Chrome-ում"}, և այնտեղ նույն պատուհանը կօգնի ավարտել։
        </p>
      ) : mode === "open-safari" ? (
        <p className="m-0 rounded-[12px] bg-subtle px-3 py-2 text-[12.5px] leading-snug text-ink">
          Այս հավելվածի բրաուզերից դա հնարավոր չէ։ Հպեք ներքևի կոճակին՝ կայքը կբացվի Safari-ում, և այնտեղ կավարտեք։
        </p>
      ) : mode === "manual" ? (
        <p className="m-0 rounded-[12px] bg-subtle px-3 py-2 text-[12.5px] leading-snug text-ink">Հպեք բրաուզերի մենյուին (⋮) և ընտրեք «Add to Home screen» կամ «Install»։</p>
      ) : null}
      {canInstall ? (
        <button className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[13px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[13.5px] font-bold text-[#2a1708] shadow-[0_6px_16px_rgb(150_100_30/22%)]" type="button" onClick={install}>
          {mode === "open-browser" ? <><ExternalLink aria-hidden="true" size={16} /> Բացել բրաուզերում</> : mode === "open-safari" ? <><ExternalLink aria-hidden="true" size={16} /> Բացել Safari-ում</> : <><Plus aria-hidden="true" size={16} /> Ավելացնել</>}
        </button>
      ) : null}
    </aside>
    {iphone && phase === "in" ? (
      // Points at Safari's Share button in the bottom bar.
      <span className="install-arrow pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+58px)] left-1/2 z-[64] -translate-x-1/2 grid place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] p-2 text-[#2a1708] shadow-[0_8px_20px_rgb(150_100_30/35%)]" aria-hidden="true">
        <ArrowDown size={22} strokeWidth={2.4} />
      </span>
    ) : null}
    </>
  );
}
