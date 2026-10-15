import {
  Bird,
  Bookmark,
  BookOpenCheck,
  BookOpenText,
  CalendarDays,
  Church,
  HandHeart,
  Search,
  Settings,
  X,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useRouteLoaderData } from "react-router";

import ArmenianEternity from "../assets/armenian-eternity.svg";
import CrownWreath from "../assets/crown-olive-wreath.webp";
import type { loader as rootLoader } from "../root";
import { ThemeToggle } from "./theme-toggle";

type SiteNavProps = { showAdminLink?: boolean };

const navigationItems = [
  { to: "/", label: "Գլխավոր", icon: Church, end: true },
  { to: "/categories/saints-lives", label: "Սրբերի կյանք", icon: Bird },
  { to: "/categories/gospel-teachings", label: "Ավետարանի ուսուցում", icon: BookOpenText },
  { to: "/categories/psalms", label: "Սաղմոսներ", icon: BookOpenText },
  { to: "/categories/bible-questions", label: "Հարցեր Աստվածաշնչից", icon: BookOpenCheck },
  { to: "/categories/prayers", label: "Աղոթք", icon: HandHeart },
  { to: "/categories/daily-readings", label: "Օրվա ընթերցանություն", icon: CalendarDays },
  { to: "/search", label: "Որոնում", icon: Search },
  { to: "/saved", label: "Իմ անկյունը", icon: Bookmark },
] as const;

const linkClass = "group flex min-h-11 items-center gap-3 rounded-[13px] px-3 py-2 text-[13px] font-semibold text-muted no-underline outline-none transition-[background,color,transform] duration-150 hover:bg-subtle hover:text-ink focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)] active:scale-[.985]";

export const SiteNav = memo(function SiteNav({ showAdminLink = false }: SiteNavProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const canManage = showAdminLink || Boolean(rootData?.showAdminLink);
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setIsOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [],
    );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  return (
    <>
      {isOpen ? (
        <button
          className="fixed inset-0 z-40 cursor-default border-0 bg-[rgb(12_5_15/52%)] p-0 backdrop-blur-[3px] motion-safe:animate-[glass-enter_180ms_ease-out]"
          type="button"
          aria-label="Փակել մենյուն"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <nav
        ref={dialogRef}
        className={`fixed right-[calc(var(--tg-content-safe-area-inset-right,0px)+12px)] bottom-[calc(var(--tg-content-safe-area-inset-bottom,0px)+12px)] z-50 grid justify-items-end transition-transform duration-200 min-[960px]:right-[calc(var(--tg-content-safe-area-inset-right,0px)+max(24px,calc((100vw-1180px)/2+24px)))] ${isOpen ? "" : "pointer-events-none"}`}
        aria-label="Հիմնական նավիգացիա"
        aria-modal={isOpen || undefined}
        role={isOpen ? "dialog" : undefined}
      >
        <div className={`mb-3 w-[min(360px,calc(100vw-24px))] origin-bottom-right overflow-hidden rounded-[22px] border border-glass-border bg-nav-surface p-2.5 shadow-[0_24px_70px_rgb(12_4_17/38%)] backdrop-blur-[24px] transition-[opacity,transform] duration-200 ${isOpen ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[.96] opacity-0"}`} aria-hidden={!isOpen}>
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-[11px] font-bold tracking-[1.4px] text-gold uppercase">Բաժիններ</span>
            <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted hover:text-ink" type="button" onClick={() => setIsOpen(false)} aria-label="Փակել մենյուն">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="max-h-[min(68svh,620px)] overflow-y-auto overscroll-contain pr-0.5">
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {navigationItems.map(({ to, label, icon: Icon, ...item }) => (
                <li key={to}>
                  <NavLink className={({ isActive }) => `${linkClass} ${isActive ? "bg-[rgb(217_181_111/10%)] text-gold-bright" : ""}`} to={to} end={"end" in item ? item.end : false} tabIndex={isOpen ? 0 : -1}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[rgb(217_181_111/16%)] bg-[rgb(217_181_111/7%)] text-gold"><Icon aria-hidden="true" size={17} strokeWidth={1.8} /></span>
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
              {canManage ? (
                <li><NavLink className={linkClass} to="/admin" tabIndex={isOpen ? 0 : -1}><span className="grid size-8 place-items-center rounded-[10px] border border-glass-border bg-subtle text-gold"><Settings aria-hidden="true" size={17} /></span>Կառավարում</NavLink></li>
              ) : null}
            </ul>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-glass-border px-2 pt-2.5">
            <span className="text-[11px] text-faint">Գույներ</span>
            <ThemeToggle className="grid size-10 cursor-pointer place-items-center rounded-full border border-glass-border bg-subtle p-0 text-gold outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]" />
          </div>
        </div>

        <button
          ref={triggerRef}
          className="pointer-events-auto relative grid size-[62px] cursor-pointer place-items-center rounded-full border border-[rgb(217_181_111/22%)] bg-[rgb(36_19_40/72%)] p-0 shadow-[0_10px_34px_rgb(16_5_21/30%)] backdrop-blur-xl outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[rgb(217_181_111/26%)] active:scale-95"
          type="button"
          aria-label={isOpen ? "Փակել մենյուն" : "Բացել մենյուն"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <img className="pointer-events-none absolute size-[56px] object-contain opacity-90 motion-safe:animate-[floating-wheat_60s_linear_infinite]" src={CrownWreath} width={256} height={256} alt="" aria-hidden="true" />
          <img className="pointer-events-none relative size-[25px] object-contain" src={ArmenianEternity} width={48} height={48} alt="" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
});
