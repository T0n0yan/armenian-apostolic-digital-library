import { Check, Copy, ExternalLink, Send, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type TelegramShareWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      openLink?: (url: string) => void;
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
  /** This page in the library, opened in the system browser where native sharing works. */
  pageUrl: string;
  className: string;
  menuAlign?: "left" | "right";
};

/**
 * Uses the system share sheet wherever the browser offers it (Chrome, Safari, macOS). Telegram's
 * Android WebView has no share sheet and Telegram gives Mini Apps no way to open one, so there a
 * small menu offers Telegram, copy link, or opening the page in the browser to share from there.
 */
export function ShareButton({ title, text, url, pageUrl, className, menuAlign = "right" }: ShareButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (resetRef.current) clearTimeout(resetRef.current); }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !containerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [isMenuOpen]);

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
    setIsMenuOpen((open) => !open);
  }, [text, title, url]);

  const webApp = typeof window === "undefined" ? undefined : (window as TelegramShareWindow).Telegram?.WebApp;
  const inTelegram = Boolean(webApp?.initData);

  const shareToTelegram = () => {
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
    if (inTelegram && webApp?.openTelegramLink) webApp.openTelegramLink(link);
    else window.open(link, "_blank", "noopener,noreferrer");
    setIsMenuOpen(false);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n${url}`);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Clipboard can be blocked; the Telegram option still works.
    }
    setIsMenuOpen(false);
  };
  const openInBrowser = () => {
    if (webApp?.openLink) webApp.openLink(pageUrl);
    else window.open(pageUrl, "_blank", "noopener,noreferrer");
    setIsMenuOpen(false);
  };

  const item = "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-[13px] font-semibold text-ink hover:bg-subtle";
  return (
    <span className="relative" ref={containerRef}>
      <button className={className} type="button" onClick={share} aria-haspopup="menu" aria-expanded={isMenuOpen} aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Պատճենվեց" : "Կիսվել"}>
        {copied ? <Check aria-hidden="true" size={17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={17} strokeWidth={1.9} />}
      </button>
      {isMenuOpen ? (
        <span className={`absolute bottom-[calc(100%+8px)] z-20 grid w-[230px] gap-0.5 rounded-[14px] border border-glass-border bg-nav-surface p-1.5 shadow-[0_18px_50px_rgb(12_4_17/40%)] backdrop-blur-xl ${menuAlign === "right" ? "right-0" : "left-0"}`} role="menu">
          <button className={item} type="button" role="menuitem" onClick={shareToTelegram}><Send aria-hidden="true" size={16} className="text-gold" /> Ուղարկել Telegram-ում</button>
          <button className={item} type="button" role="menuitem" onClick={copyLink}><Copy aria-hidden="true" size={16} className="text-gold" /> Պատճենել հղումը</button>
          {inTelegram ? <button className={item} type="button" role="menuitem" onClick={openInBrowser}><ExternalLink aria-hidden="true" size={16} className="text-gold" /> Բացել բրաուզերում</button> : null}
        </span>
      ) : null}
    </span>
  );
}
