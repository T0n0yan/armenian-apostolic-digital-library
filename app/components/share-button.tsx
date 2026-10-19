import { Check, Copy, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet } from "./bottom-sheet";

type TelegramShareWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      openTelegramLink?: (url: string) => void;
      shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
    };
  };
};

type ShareButtonProps = {
  title: string;
  /** Text shared with the link (title and a short excerpt). */
  text: string;
  /** Link that recipients open (the Telegram post). */
  url: string;
  /** This page in the library: what browser readers share and copy. */
  pageUrl: string;
  /** Lets the Mini App share the material through Telegram's share sheet. */
  materialId?: string;
  className: string;
  /** Shows a short "Կիսվել" label under the icon (material page toolbar). */
  label?: boolean;
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

function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Կիսվել" className="gap-2 p-3">
      <div className="flex items-center justify-between px-1 pb-1">
        <strong className="line-clamp-1 text-[13px] text-muted">{title}</strong>
        <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
      </div>
      {children}
    </BottomSheet>
  );
}

/**
 * Inside the Mini App, opens Telegram's share sheet over the app (shareMessage), or failing that
 * Telegram's "send to a chat" picker (Telegram's Android Mini App WebView has no system share
 * sheet). In a browser, opens the phone's share
 * sheet (Android Quick Share, iOS share sheet); without one, the link is copied.
 */
/** The page's address without search/marking parameters, absolute. */
function siteUrl(pageUrl: string) {
  const address = new URL(pageUrl, window.location.origin);
  address.search = "";
  address.hash = "";
  return address.toString();
}

export function ShareButton({ title, text, url, pageUrl, className, materialId, label = false }: ShareButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, markCopied] = useCopied();

  const share = useCallback(async () => {
    const webApp = telegramWebApp();
    // Telegram's share sheet over the Mini App, so the reader stays in the library.
    if (webApp?.initData && webApp.shareMessage && materialId) {
      const prepared = await fetch("/api/share-prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ materialId }),
      }).then((response) => response.ok ? response.json() as Promise<{ id: string | null }> : null).catch(() => null);
      if (prepared?.id) {
        webApp.shareMessage(prepared.id);
        return;
      }
    }
    if (webApp?.initData && webApp.openTelegramLink) {
      const picker = new URL("https://t.me/share/url");
      picker.searchParams.set("url", url);
      if (text) picker.searchParams.set("text", text);
      webApp.openTelegramLink(picker.toString());
      return;
    }
    // In a browser, share the library's own page (the Telegram post is for Telegram readers).
    if (await systemShare({ title, text, url: siteUrl(pageUrl) })) return;
    setSheetOpen(true);
  }, [materialId, pageUrl, text, title, url]);

  const close = useCallback(() => setSheetOpen(false), []);
  const copyLink = async () => {
    await copyText(telegramWebApp()?.initData ? url : siteUrl(pageUrl));
    markCopied();
    setSheetOpen(false);
  };

  return (
    <>
      <button className={className} type="button" onClick={share} aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Պատճենվեց" : "Կիսվել"}>
        {copied ? <Check aria-hidden="true" size={label ? 20 : 17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={label ? 20 : 17} strokeWidth={1.9} />}
        {label ? <span>{copied ? "Պատճենվեց" : "Կիսվել"}</span> : null}
      </button>
      <Sheet title={title} open={sheetOpen} onClose={close}>
          <button className={sheetItem} type="button" onClick={copyLink}><Copy aria-hidden="true" size={18} className="text-gold" /> Պատճենել հղումը</button>
      </Sheet>
    </>
  );
}
