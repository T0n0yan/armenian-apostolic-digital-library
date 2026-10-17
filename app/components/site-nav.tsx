import { Bookmark, Church, Search, Settings, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useRouteLoaderData } from "react-router";

import ArmenianEternity from "../assets/armenian-eternity.svg";
import CrownWreath from "../assets/crown-olive-wreath.webp";
import type { loader as rootLoader } from "../root";
import { CategoryIcon } from "./category-icon";
import { ReadingSettings } from "./reading-settings";

type SiteNavProps = { showAdminLink?: boolean };

const quickItems = [
  { to: "/", label: "Գլխավոր", icon: Church, end: true },
  { to: "/search", label: "Որոնում", icon: Search, end: false },
  { to: "/saved", label: "Իմ անկյունը", icon: Bookmark, end: false },
] as const;

const linkClass = "group flex min-h-11 items-center gap-3 rounded-[13px] px-3 py-2 text-[13px] font-semibold text-muted no-underline outline-none transition-[background,color,transform] duration-150 hover:bg-subtle hover:text-ink focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)] active:scale-[.985]";

export const SiteNav = memo(function SiteNav({ showAdminLink = false }: SiteNavProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const canManage = showAdminLink || Boolean(rootData?.showAdminLink);
  const topicItems = rootData?.categories ?? [];
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [isTucked, setIsTucked] = useState(false);

  useEffect(() => setIsOpen(false), [location.pathname]);

  // Tuck the floating trigger away while reading downward so it never covers text or card actions.
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 24;
        if (y < 80 || nearBottom || y < lastY - 6) setIsTucked(false);
        else if (y > lastY + 6) setIsTucked(true);
        lastY = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => setIsTucked(false), [location.pathname]);

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
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-[13px] font-bold text-ink">Մենյու</span>
            <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted hover:text-ink" type="button" onClick={() => setIsOpen(false)} aria-label="Փակել մենյուն">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="grid max-h-[min(72svh,660px)] gap-3 overflow-y-auto overscroll-contain pr-0.5">
            <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label="Հիմնական էջեր">
              {quickItems.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink className={({ isActive }) => `flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-1 text-center text-[11px] font-semibold no-underline outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)] ${isActive ? "border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/10%)] text-gold-bright" : "border-glass-border bg-subtle text-muted hover:text-ink"}`} to={to} end={end} tabIndex={isOpen ? 0 : -1}>
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} className="text-gold" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {topicItems.length > 0 ? (
              <section className="grid gap-1" aria-labelledby="menu-topics">
                <h2 className="m-0 px-2 text-[11px] font-bold tracking-[1.2px] text-gold uppercase" id="menu-topics">Բաժիններ</h2>
                <ul className="m-0 grid list-none gap-0.5 p-0">
                  {topicItems.map((topic) => {
                    return (
                      <li key={topic.id}>
                        <NavLink className={({ isActive }) => `${linkClass} ${isActive ? "bg-[rgb(217_181_111/10%)] text-gold-bright" : ""}`} to={`/categories/${topic.slug}`} tabIndex={isOpen ? 0 : -1}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] text-gold-bright" data-telegram-emoji-id={topic.iconEmojiId ?? undefined}><CategoryIcon categoryId={topic.id} categoryName={topic.name} aria-hidden="true" size={16} strokeWidth={1.8} /></span>
                          <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                          {topic.status !== "open" ? <span className="text-[10px] text-faint">{topic.status === "closed" ? "փակ" : "թաքցված"}</span> : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="grid gap-2 border-t border-glass-border px-1 pt-3" aria-labelledby="menu-settings">
              <h2 className="m-0 px-1 text-[11px] font-bold tracking-[1.2px] text-gold uppercase" id="menu-settings">Կարգավորումներ</h2>
              <ReadingSettings />
              {canManage ? (
                <NavLink className={linkClass} to="/admin" tabIndex={isOpen ? 0 : -1}><span className="grid size-8 place-items-center rounded-[10px] border border-glass-border bg-subtle text-gold"><Settings aria-hidden="true" size={17} /></span>Կառավարում</NavLink>
              ) : null}
            </section>
          </div>
        </div>

        <button
          ref={triggerRef}
          className={`relative grid size-[62px] cursor-pointer place-items-center rounded-full border border-[var(--fab-border)] bg-[var(--fab-bg)] p-0 shadow-[var(--fab-shadow)] backdrop-blur-xl outline-none transition-[transform,opacity] duration-200 focus-visible:ring-4 focus-visible:ring-[rgb(217_181_111/26%)] active:scale-95 ${isTucked && !isOpen ? "pointer-events-none translate-y-[calc(100%+28px)] opacity-0" : "pointer-events-auto hover:-translate-y-0.5"}`}
          type="button"
          aria-label={isOpen ? "Փակել մենյուն" : "Բացել մենյուն"}
          aria-expanded={isOpen}
          onFocus={() => setIsTucked(false)}
          onClick={() => setIsOpen((open) => !open)}
        >
          <img className="pointer-events-none absolute size-[56px] object-contain opacity-90 motion-safe:animate-[floating-wheat_60s_linear_infinite]" src={CrownWreath} width={256} height={256} alt="" aria-hidden="true" />
          <span className="gold-mark pointer-events-none relative size-[25px]" style={{ "--mark": `url(${ArmenianEternity})` } as React.CSSProperties} aria-hidden="true" />
        </button>
      </nav>
    </>
  );
});
