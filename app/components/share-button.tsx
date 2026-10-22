import { Check, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ShareButtonProps = {
  title: string;
  /** Text shared with the link (title and a short excerpt). */
  text: string;
  /** This page in the library: what readers share and copy. */
  pageUrl: string;
  className: string;
  /** Shows a short "Կիսվել" label under the icon (material page toolbar). */
  label?: boolean;
  /** The material's address when it has a link-preview card to share as a picture. */
  cardPath?: string | null;
};

export async function copyText(value: string) {
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

let sheetOpen = false;

/**
 * Opens the phone's share sheet; false only when the browser has none. A tap while the sheet is
 * open, or closing it without sending, counts as handled, so nothing is copied instead.
 */
export async function systemShare(data: ShareData) {
  if (sheetOpen) return true;
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return false;
  sheetOpen = true;
  try {
    await navigator.share(data);
  } catch {
    // Cancelled, or the sheet refused: nothing more to do.
  } finally {
    sheetOpen = false;
  }
  return true;
}

type MiniApp = { initData?: string; shareMessage?: (id: string, callback?: (sent: boolean) => void) => void };
const miniApp = () => typeof window === "undefined" ? undefined : (window as { Telegram?: { WebApp?: MiniApp } }).Telegram?.WebApp;

/**
 * Shares a material's link-preview card itself (the picture), with its name, text and link as the
 * message: in the Mini App through Telegram's own share sheet (a prepared photo message), in a
 * browser through the phone's share sheet with the picture attached. Without either, the link is
 * shared or, last, copied. `cardPath` is the material's address (/saghmosner/22/3).
 */
export async function shareCard({ title, text, url, cardPath }: { title: string; text: string; url: string; cardPath?: string | null }) {
  // Name, text, link — each once, in that order.
  const body = text.trim() && text.trim() !== title.trim() ? text.trim() : "";
  const message = [title.trim(), body, url].filter(Boolean).join("\n");
  const webApp = miniApp();
  if (cardPath && webApp?.initData && webApp.shareMessage) {
    const prepared = await fetch("/api/share-prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: cardPath, caption: message }),
    }).then((response) => response.ok ? response.json() as Promise<{ id: string | null }> : null).catch(() => null);
    if (prepared?.id) { webApp.shareMessage(prepared.id); return "shared" as const; }
  }
  if (cardPath && !sheetOpen && typeof navigator.canShare === "function") {
    const blob = await fetch(`/og/card${cardPath}`).then((response) => response.ok ? response.blob() : null).catch(() => null);
    const file = blob && blob.type.startsWith("image/") ? new File([blob], `${cardPath.slice(1).replace(/\//gu, "-")}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }) : null;
    if (file && navigator.canShare({ files: [file] })) {
      // The picture with the message; some apps drop a separate url, so the link is in the text.
      if (await systemShare({ files: [file], text: message })) return "shared" as const;
    }
  }
  if (await systemShare({ title, text: [title.trim(), body].filter(Boolean).join("\n"), url })) return "shared" as const;
  await copyText(message);
  return "copied" as const;
}

export function useCopied() {
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

/** The page's address without search/marking parameters, absolute. */
function siteUrl(pageUrl: string) {
  const address = new URL(pageUrl, window.location.origin);
  address.search = "";
  address.hash = "";
  return address.toString();
}

/**
 * Shares the site's own page, in a browser and in the Mini App alike, so whoever receives it reads
 * on and needs no Telegram: the phone's share sheet when there is one (Android Quick Share, iOS
 * share sheet), otherwise the link is copied.
 */
export function ShareButton({ title, text, pageUrl, className, label = false, cardPath = null }: ShareButtonProps) {
  const [copied, markCopied] = useCopied();

  const share = useCallback(async () => {
    if (await shareCard({ title, text, url: siteUrl(pageUrl), cardPath }) === "copied") markCopied();
  }, [cardPath, markCopied, pageUrl, text, title]);

  return (
    <button className={className} type="button" onClick={share} aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Հղումը պատճենվեց" : "Կիսվել"}>
      {copied ? <Check aria-hidden="true" size={label ? 20 : 17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={label ? 20 : 17} strokeWidth={1.9} />}
      {label ? <span>{copied ? "Պատճենվեց" : "Կիսվել"}</span> : null}
    </button>
  );
}
