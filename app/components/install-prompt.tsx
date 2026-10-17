import { Plus, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import DoveMark from "../assets/dove-mark.png";

const DISMISS_KEY = "library-install-dismissed-at";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 12_000;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type TelegramHomeScreen = {
  initData?: string;
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (callback: (status: "unsupported" | "unknown" | "added" | "missed") => void) => void;
};

type Mode = "telegram" | "browser" | "ios";

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Offers to put the library on the home screen: Telegram's addToHomeScreen inside the Mini App,
 * the browser's install prompt on Chrome/Edge/Android, or Share → Add to Home Screen steps on iOS
 * Safari, which has no install API. Shown once after a short visit; "Հետո" hides it for 30 days.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [visible, setVisible] = useState(false);
  // "in" slides the toast up from below the screen; "out" slides it back down before unmounting.
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (recentlyDismissed()) return;
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return;
    let timer: number | undefined;
    const showSoon = (next: Mode) => {
      setMode(next);
      timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    };

    const webApp = (window as Window & { Telegram?: { WebApp?: TelegramHomeScreen } }).Telegram?.WebApp;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      showSoon("browser");
    };

    // The Telegram SDK loads asynchronously; give it a moment before deciding.
    const decide = window.setTimeout(() => {
      const telegram = (window as Window & { Telegram?: { WebApp?: TelegramHomeScreen } }).Telegram?.WebApp ?? webApp;
      if (telegram?.initData && telegram.addToHomeScreen && telegram.checkHomeScreenStatus) {
        telegram.checkHomeScreenStatus((status) => { if (status === "missed" || status === "unknown") showSoon("telegram"); });
        return;
      }
      const ios = /iphone|ipad|ipod/iu.test(navigator.userAgent) && !/crios|fxios|edgios/iu.test(navigator.userAgent);
      if (ios && !telegram?.initData) showSoon("ios");
    }, 1_500);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.clearTimeout(decide);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismiss = useCallback(() => {
    setPhase("out");
    window.setTimeout(() => setVisible(false), 420);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* Private mode: it just shows again. */ }
  }, []);

  const install = useCallback(async () => {
    if (mode === "telegram") {
      (window as Window & { Telegram?: { WebApp?: TelegramHomeScreen } }).Telegram?.WebApp?.addToHomeScreen?.();
      dismiss();
    } else if (mode === "browser" && installEvent) {
      await installEvent.prompt();
      await installEvent.userChoice.catch(() => null);
      setInstallEvent(null);
      dismiss();
    }
  }, [dismiss, installEvent, mode]);

  if (!visible || !mode) return null;
  return (
    <aside
      className="fixed rounded-[20px] border border-glass-border bg-[var(--page-bg)] shadow-[0_18px_50px_rgb(40_20_10/28%)] right-[calc(var(--tg-inset-right,0px)+88px)] bottom-[calc(var(--tg-inset-bottom,0px)+14px)] left-[calc(var(--tg-inset-left,0px)+12px)] z-40 mx-auto grid max-w-[420px] grid-cols-[44px_1fr_auto] items-center gap-3 px-3.5 py-3 install-toast" data-phase={phase}
      role="dialog"
      aria-label="Ավելացնել գլխավոր էկրանին"
    >
      <img className="size-11 object-contain" src={DoveMark} width={44} height={44} alt="" aria-hidden="true" />
      <div className="grid gap-0.5">
        <strong className="text-[13px] leading-tight text-ink">Ավելացրու գլխավոր էկրանին</strong>
        {mode === "ios" ? (
          <span className="text-[11.5px] leading-snug text-muted">
            Սեղմիր <Share aria-label="Share" className="inline size-[13px] align-[-2px] text-gold-bright" />, ապա «Add to Home Screen»
          </span>
        ) : (
          <span className="text-[11.5px] leading-snug text-muted">Գրադարանը մեկ սեղմումով՝ ինչպես հավելված</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {mode !== "ios" ? (
          <button className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-[11px] border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/16%)] px-3 text-[12px] font-bold text-gold-bright" type="button" onClick={install}>
            <Plus aria-hidden="true" size={14} /> Ավելացնել
          </button>
        ) : null}
        <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:text-ink" type="button" onClick={dismiss} aria-label="Հետո">
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </aside>
  );
}
