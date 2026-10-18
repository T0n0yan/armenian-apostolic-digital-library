import { Check, Copy, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TelegramShareWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      openTelegramLink?: (url: string) => void;
    };
  };
};

type ShareButtonProps = {
  title: string;
  /** Text shared with the link (title and a short excerpt). */
  text: string;
  /** Link that recipients open (the Telegram post). */
  url: string;
  /** This page in the library (kept for callers; sharing sends the Telegram post). */
  pageUrl: string;
  className: string;
};

function telegramWebApp() {
  return typeof window === "undefined" ? undefined : (window as TelegramShareWindow).Telegram?.WebApp;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Older WebViews: fall back to a hidden selection.
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try { document.execCommand("copy"); } catch { /* Nothing more to try. */ }
    field.remove();
  }
}

/** Opens the phone's share sheet; false when the browser has none or it failed. */
async function systemShare(data: ShareData) {
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return false;
  try {
    await navigator.share(data);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) return false;
  }
  return true;
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetRef.current) clearTimeout(resetRef.current); }, []);
  const markCopied = useCallback(() => {
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopied(false), 1_800);
  }, []);
  return [copied, markCopied] as const;
}

const sheetItem = "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-subtle px-4 text-left text-[14px] font-semibold text-ink hover:bg-glass-strong";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] grid items-end justify-items-center p-3 pb-[calc(var(--tg-inset-bottom,0px)+12px)]" role="dialog" aria-label="Կիսվել">
      <button className="absolute inset-0 cursor-default border-0 bg-[rgb(20_10_24/40%)] p-0 motion-safe:animate-[glass-enter_200ms_ease-out]" type="button" aria-label="Փակել" onClick={onClose} />
      <div className="install-toast relative grid w-full max-w-[420px] gap-2 rounded-[22px] border border-glass-border bg-[var(--page-bg)] p-3 shadow-[0_24px_60px_rgb(20_8_24/40%)]" data-phase="in">
        <div className="flex items-center justify-between px-1 pb-1">
          <strong className="line-clamp-1 text-[13px] text-muted">{title}</strong>
          <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Inside the Mini App, opens Telegram's own "send to a chat" picker in one tap (Telegram's
 * Android Mini App WebView offers no system share sheet). In a browser, opens the phone's share
 * sheet (Android Quick Share, iOS share sheet); without one, the link is copied.
 */
export function ShareButton({ title, text, url, className }: ShareButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, markCopied] = useCopied();

  const share = useCallback(async () => {
    const webApp = telegramWebApp();
    if (webApp?.initData && webApp.openTelegramLink) {
      const picker = new URL("https://t.me/share/url");
      picker.searchParams.set("url", url);
      if (text) picker.searchParams.set("text", text);
      webApp.openTelegramLink(picker.toString());
      return;
    }
    if (await systemShare({ title, text, url })) return;
    setSheetOpen(true);
  }, [text, title, url]);

  const close = useCallback(() => setSheetOpen(false), []);
  const copyLink = async () => {
    await copyText(url);
    markCopied();
    setSheetOpen(false);
  };

  return (
    <>
      <button className={className} type="button" onClick={share} aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Պատճենվեց" : "Կիսվել"}>
        {copied ? <Check aria-hidden="true" size={17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />}
      </button>
      {sheetOpen ? (
        <Sheet title={title} onClose={close}>
          <button className={sheetItem} type="button" onClick={copyLink}><Copy aria-hidden="true" size={18} className="text-gold" /> Պատճենել հղումը</button>
        </Sheet>
      ) : null}
    </>
  );
}
