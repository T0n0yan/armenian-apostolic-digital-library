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

/** Opens the phone's share sheet; false when the browser has none or it failed. */
export async function systemShare(data: ShareData) {
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return false;
  try {
    await navigator.share(data);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) return false;
  }
  return true;
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
export function ShareButton({ title, text, pageUrl, className, label = false }: ShareButtonProps) {
  const [copied, markCopied] = useCopied();

  const share = useCallback(async () => {
    const link = siteUrl(pageUrl);
    if (await systemShare({ title, text, url: link })) return;
    await copyText(link);
    markCopied();
  }, [markCopied, pageUrl, text, title]);

  return (
    <button className={className} type="button" onClick={share} aria-label={copied ? "Հղումը պատճենված է" : "Կիսվել նյութով"} title={copied ? "Հղումը պատճենվեց" : "Կիսվել"}>
      {copied ? <Check aria-hidden="true" size={label ? 20 : 17} strokeWidth={2} /> : <Share2 aria-hidden="true" size={label ? 20 : 17} strokeWidth={1.9} />}
      {label ? <span>{copied ? "Պատճենվեց" : "Կիսվել"}</span> : null}
    </button>
  );
}
