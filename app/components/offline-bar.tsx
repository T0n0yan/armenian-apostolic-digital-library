import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRevalidator } from "react-router";

const PAGES_CACHE = /^pages-/u;

/** Հեռախոսում պահված էջերի հասցեները (service worker-ի PAGES քեշից)։ */
async function keptPaths() {
  const paths = new Set<string>();
  if (typeof caches === "undefined") return paths;
  for (const name of await caches.keys()) {
    if (!PAGES_CACHE.test(name)) continue;
    for (const request of await (await caches.open(name)).keys()) {
      const url = new URL(request.url);
      if (!url.pathname.endsWith(".data") && !url.pathname.startsWith("/api/")) paths.add(url.pathname);
    }
  }
  return paths;
}

/**
 * Առանց ինտերնետի. վերևում նշում է, պահված չեղած էջերի հղումները աղոտ են ու չեն բացվում,
 * պահվածները բացվում են ամբողջ էջով (service worker-ը տալիս է պահված տարբերակը)։
 * Ինտերնետը վերադառնալիս էջը ինքնաբերաբար թարմանում է։
 */
export function OfflineBar() {
  const [offline, setOffline] = useState(false);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState(false);
  const revalidator = useRevalidator();
  const location = useLocation();

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const back = () => { setOffline(false); revalidator.revalidate(); };
    update();
    window.addEventListener("offline", update);
    window.addEventListener("online", back);
    return () => { window.removeEventListener("offline", update); window.removeEventListener("online", back); };
  }, [revalidator]);

  useEffect(() => {
    if (!offline) {
      document.documentElement.removeAttribute("data-offline");
      for (const link of document.querySelectorAll("a[data-offline-missing]")) link.removeAttribute("data-offline-missing");
      return;
    }
    document.documentElement.setAttribute("data-offline", "");
    let active = true;
    void keptPaths().then((paths) => {
      if (!active) return;
      setKept(paths);
      for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")) {
        const path = new URL(link.href).pathname;
        if (paths.has(path) || path === location.pathname) link.removeAttribute("data-offline-missing");
        else link.setAttribute("data-offline-missing", "");
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [offline, location.pathname]);

  useEffect(() => {
    if (!offline) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.origin !== window.location.origin || event.defaultPrevented) return;
      const path = link.pathname;
      if (path === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      // Պահված էջը բացվում է ամբողջությամբ (HTML-ը քեշից). React Router-ի տվյալները առանց ինտերնետի չեն գա։
      if (kept.has(path)) window.location.assign(link.href);
      else { setNotice(true); window.setTimeout(() => setNotice(false), 2600); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [offline, kept]);

  if (!offline) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--tg-inset-top,0px)+8px)] z-[2050] flex justify-center px-3" role="status">
      <div className="inline-flex max-w-md items-center gap-2 rounded-full border border-[rgb(217_181_111/45%)] bg-[var(--nav-surface)] px-3.5 py-1.5 font-sans text-[12.5px] font-semibold text-ink shadow-[0_6px_18px_rgb(20_8_24/22%)]">
        <WifiOff aria-hidden="true" size={15} className="shrink-0 text-gold-bright" />
        {notice ? "Այս էջը պահված չէ. կբացվի ինտերնետը վերադառնալիս" : "Ինտերնետ չկա · բաց են միայն պահված էջերը"}
      </div>
    </div>
  );
}
