import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TelegramShareWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      openLink?: (url: string) => void;
    };
  };
};

type ShareButtonProps = {
  title: string;
  /** Text shared with the link (title and a short excerpt). */
  text: string;
  /** Link that recipients open (the Telegram post). */
  url: string;
  /** This page in the library, opened in the system browser where its share sheet works. */
  pageUrl: string;
  className: string;
};

/**
 * Opens the phone's own share sheet (Android Quick Share, iOS share sheet, macOS share menu)
 * wherever the browser provides it. Telegram's in-app browser on Android has no share sheet, so
 * there a small bottom sheet offers "copy link" and "share from the browser", which reopens the
 * page in the system browser where the native sheet is available.
 */
export function ShareButton({ title, text, url, pageUrl, className }: ShareButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); return () => { if (resetRef.current) clearTimeout(resetRef.current); }; }, []);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const share = useCallback(async () => {
    const data = { title, text, url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    setSheetOpen(true);
  }, [text, title, url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older WebViews: fall back to a hidden selection.
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try { document.execCommand("copy"); } catch { /* Nothing more to try. */ }
      field.remove();
    }
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setCopied(false), 1_800);
    setSheetOpen(false);
  };

  const webApp = typeof window === "undefined" ? undefined : (window as TelegramShareWindow).Telegram?.WebApp;
  const inTelegram = Boolean(webApp?.initData);
  const openInBrowser = () => {
    if (webApp?.openLink) webApp.openLink(pageUrl);
    else window.open(pageUrl, "_blank", "noopener,noreferrer");
    setSheetOpen(false);
  };

  const item = "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-subtle px-4 text-left text-[14px] font-semibold text-ink hover:bg-glass-strong";
  return (
    <>
      <button className={className} type="button" onClick={share} aria-haspopup="dialog" aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Պատճենվեց" : "Կիսվել"}>
        {copied ? <Check aria-hidden="true" size={17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />}
      </button>
      {mounted && sheetOpen ? createPortal(
        <div className="fixed inset-0 z-[60] grid items-end justify-items-center p-3 pb-[calc(var(--tg-inset-bottom,0px)+12px)]" role="dialog" aria-label="Կիսվել">
          <button className="absolute inset-0 cursor-default border-0 bg-[rgb(20_10_24/40%)] p-0 motion-safe:animate-[glass-enter_200ms_ease-out]" type="button" aria-label="Փակել" onClick={() => setSheetOpen(false)} />
          <div className="install-toast relative grid w-full max-w-[420px] gap-2 rounded-[22px] border border-glass-border bg-[var(--page-bg)] p-3 shadow-[0_24px_60px_rgb(20_8_24/40%)]" data-phase="in">
            <div className="flex items-center justify-between px-1 pb-1">
              <strong className="line-clamp-1 text-[13px] text-muted">{title}</strong>
              <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={() => setSheetOpen(false)} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
            </div>
            <button className={item} type="button" onClick={copyLink}><Copy aria-hidden="true" size={18} className="text-gold" /> Պատճենել հղումը</button>
            {inTelegram ? <button className={item} type="button" onClick={openInBrowser}><ExternalLink aria-hidden="true" size={18} className="text-gold" /> Կիսվել բրաուզերից</button> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
