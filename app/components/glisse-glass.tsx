/*
 * Glisse liquid glass (https://github.com/0kzh/glisse), staging-ի փորձ։
 * Կայքի բոլոր ապակե տարրերի տակ (մենյու, կլոր կոճակ, պատուհաններ, toast-եր, քարտեր, սալիկներ) ավտոմատ
 * դրվում է Glisse-ի `Glass`-ը՝ առանձին փոքր React root-ով, որ տարրերի կոմպոնենտները փոխելու կարիք չլինի։
 * Բեկումը (ետևի պատկերի ծռվելը) միայն Chromium-ում է (Chrome, Android). Safari-ում՝ մշուշ և լուսավոր եզր։
 * Կարգավորումներում «Liquid glass (փորձ)» անջատիչով կարելի է անջատել և համեմատել։
 */
import { Glass } from "glisse";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

/** Այն տարրերը, որոնց տակ դրվում է ապակին (app.css-ում նույն ցանկը՝ `html[data-glisse]`)։ */
export const GLASS_HOSTS = [
  ".menu-panel",
  ".liquid-fab",
  ".liquid-sheet:not(.glossary-sheet)",
  ".frosted-card",
  ".frosted-panel",
  ".glass-tile",
  ".header-search.is-floating",
].join(", ");

const STORAGE_KEY = "apostolic-glisse";
export const GLASS_EVENT = "apostolic:glisse";

export function readGlassPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeGlassPreference(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Գաղտնի ռեժիմում պահել չի ստացվում. գործում է մինչև էջը փակելը։
  }
  window.dispatchEvent(new Event(GLASS_EVENT));
}

type Mounted = { holder: HTMLSpanElement; root: Root };

function install(): () => void {
  const html = document.documentElement;
  html.dataset.glisse = "";
  const mounted = new Map<HTMLElement, Mounted>();

  const unmount = (host: HTMLElement, item: Mounted) => {
    item.root.unmount();
    item.holder.remove();
    mounted.delete(host);
  };

  const scan = () => {
    frame = 0;
    for (const [host, item] of mounted) {
      // Տարրը հանվել է, այլևս ապակե չէ, կամ React-ը փոխարինել է նրա պարունակությունը (մեր շերտն էլ հետը)։
      if (!host.isConnected || !host.matches(GLASS_HOSTS) || item.holder.parentElement !== host) unmount(host, item);
    }
    document.querySelectorAll<HTMLElement>(GLASS_HOSTS).forEach((host) => {
      if (mounted.has(host)) return;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const holder = document.createElement("span");
      holder.className = "ap-glass-root";
      holder.setAttribute("aria-hidden", "true");
      host.insertBefore(holder, host.firstChild);
      const root = createRoot(holder);
      root.render(<Glass className="ap-glass-layer" />);
      mounted.set(host, { holder, root });
    });
  };

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(scan);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  scan();

  // Էջը ոլորելիս բեկումը դադարում է (app.css, `data-scrolling`). Chrome-ը SVG ֆիլտրը պրոցեսորով է հաշվում,
  // և ամեն կադր 15 ապակի նորից հաշվելը հեռախոսում կտրտում էր scroll-ը։ Կանգնելուց 180 մվ հետո՝ նորից բեկում։
  let settle = 0;
  const onScroll = () => {
    if (!("scrolling" in html.dataset)) html.dataset.scrolling = "";
    window.clearTimeout(settle);
    settle = window.setTimeout(() => { delete html.dataset.scrolling; }, 180);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.clearTimeout(settle);
    delete html.dataset.scrolling;
    for (const [host, item] of mounted) unmount(host, item);
    delete html.dataset.glisse;
  };
}

/** Միացնում է Glisse-ի ապակին ամբողջ կայքում (root.tsx-ում մեկ անգամ)։ */
export function GlisseGlass() {
  useEffect(() => {
    let stop: (() => void) | null = null;
    const apply = () => {
      stop?.();
      stop = readGlassPreference() ? install() : null;
    };
    apply();
    window.addEventListener(GLASS_EVENT, apply);
    return () => {
      window.removeEventListener(GLASS_EVENT, apply);
      stop?.();
    };
  }, []);
  return null;
}
