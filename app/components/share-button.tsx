import { Check, Copy, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TelegramShareWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
    };
  };
};

/** Query parameter that asks a page opened from the Mini App to offer the system share sheet. */
const SHARE_PARAM = "share";

type ShareButtonProps = {
  title: string;
  /** Text shared with the link (title and a short excerpt). */
  text: string;
  /** Link that recipients open (the Telegram post). */
  url: string;
  /** This page in the library, opened in Telegram's browser where its share sheet works. */
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

/** Only Telegram post links may be shared through the page's query string. */
function shareableTelegramUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "t.me" ? url.toString() : null;
  } catch {
    return null;
  }
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
 * Shares through the phone's own share sheet (Android Quick Share, iOS share sheet). Telegram's
 * Mini App WebView on Android has no share sheet, but Telegram's in-app browser does; there the
 * button reopens this page in that browser, which offers the sheet with one more tap
 * (<SharePrompt>). Elsewhere without a share sheet, the link is copied.
 */
export function ShareButton({ title, text, url, pageUrl, className }: ShareButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, markCopied] = useCopied();

  const share = useCallback(async () => {
    if (await systemShare({ title, text, url })) return;
    const webApp = telegramWebApp();
    if (webApp?.initData && webApp.openLink) {
      const target = new URL(pageUrl, window.location.origin);
      target.searchParams.set(SHARE_PARAM, url);
      webApp.openLink(target.toString(), { try_instant_view: false });
      return;
    }
    setSheetOpen(true);
  }, [pageUrl, text, title, url]);

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

/**
 * On a page the Mini App opened for sharing (`?share=<post link>`), offers the share sheet right
 * away. Browsers open it only from a tap, so this shows one big button for it.
 */
export function SharePrompt() {
  const [target, setTarget] = useState<string | null>(null);
  const [copied, markCopied] = useCopied();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareUrl = shareableTelegramUrl(params.get(SHARE_PARAM));
    if (!shareUrl) return;
    setTarget(shareUrl);
    // Drop the parameter so reloading or sharing this page doesn't prompt again.
    params.delete(SHARE_PARAM);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  const close = useCallback(() => setTarget(null), []);
  if (!target) return null;
  const title = document.title.split(" — ")[0] || document.title;
  const canShare = typeof navigator.share === "function";
  return (
    <Sheet title={title} onClose={close}>
      {canShare ? (
        <button
          className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[16px] border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/20%)] text-[15px] font-bold text-gold-bright"
          type="button"
          onClick={async () => { if (await systemShare({ title, url: target })) close(); }}
        >
          <Share2 aria-hidden="true" size={19} /> Կիսվել
        </button>
      ) : null}
      <button className={sheetItem} type="button" onClick={async () => { await copyText(target); markCopied(); }}>
        {copied ? <Check aria-hidden="true" size={18} className="text-gold" /> : <Copy aria-hidden="true" size={18} className="text-gold" />}
        {copied ? "Պատճենվեց" : "Պատճենել հղումը"}
      </button>
    </Sheet>
  );
}
