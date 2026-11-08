import { useEffect } from "react";

/** Մեկ էջի բացման ընթացքում ամենաշատը այսքան հաղորդում (սխալների ցիկլը սերվերը չծանրաբեռնի)։ */
const MAX_REPORTS = 5;
/** Աղմուկ, որը մեր կոդի սխալ չէ (բրաուզերի ընդլայնումներ, ResizeObserver, օտար script-եր)։ */
const IGNORED = /ResizeObserver loop|^Script error\.?$|extension:\/\/|Non-Error promise rejection captured|AbortError|The operation was aborted|Load failed$/iu;

function platform() {
  const agent = navigator.userAgent;
  const device = /android/iu.test(agent) ? "android" : /iphone|ipad|ipod/iu.test(agent) ? "ios" : "desktop";
  return (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ? `telegram-${device}` : device;
}

/**
 * Բրաուզերի սխալները ուղարկում է /api/client-error (անանուն). տերը դրանք տեսնում է /admin/usage-ում,
 * առանց սպասելու, որ ընթերցողը գրի։ Ոչինչ չի ցույց տալիս։
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>();
    const report = (message: string, source: string, stack: string) => {
      if (!message || IGNORED.test(message) || IGNORED.test(source) || sent.size >= MAX_REPORTS || sent.has(message)) return;
      // Միայն մեր ֆայլերի սխալները (կամ առանց ֆայլի, օր.՝ promise-ի մերժում)։
      if (source && !source.startsWith(window.location.origin)) return;
      sent.add(message);
      void fetch("/api/client-error", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, source, stack: stack.slice(0, 1200), path: window.location.pathname, platform: platform() }),
      }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => {
      const at = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "";
      report(String(event.message ?? ""), at, String((event.error as Error | undefined)?.stack ?? ""));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: unknown; stack?: unknown } | null;
      report(String(reason?.message ?? reason ?? ""), "", String(reason?.stack ?? ""));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
