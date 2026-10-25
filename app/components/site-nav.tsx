import { ArrowLeft, Bookmark, ChevronRight, Church, LogIn, LogOut, Search, Settings, Settings2, Smartphone, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Form, NavLink, useLocation, useRouteLoaderData } from "react-router";

import ArmenianEternity from "../assets/armenian-eternity.svg";
import CrownWreath from "../assets/crown-olive-wreath.webp";
import type { loader as rootLoader } from "../root";
import { CategoryIcon } from "./category-icon";
import { ReminderIndicator } from "./reminder-indicator";
import { INSTALL_REQUEST_EVENT, isInstalledApp, isTelegramMiniApp } from "./install-prompt";
import { SettingsPanel } from "./settings-panel";
import { sectionPath } from "../utils/material-path";

type SiteNavProps = { showAdminLink?: boolean };

const quickItems = [
  { to: "/", label: "Գլխավոր", icon: Church, end: true },
  { to: "/search", label: "Որոնում", icon: Search, end: false },
  { to: "/saved", label: "Իմ անկյունը", icon: Bookmark, end: false },
] as const;

const linkClass = "group flex min-h-11 items-center gap-3 rounded-[13px] px-3 py-2 text-[13px] font-semibold text-muted no-underline outline-none transition-[background,color,transform,translate,scale] duration-150 hover:bg-subtle hover:text-ink focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)] active:scale-[.985]";

export const SiteNav = memo(function SiteNav({ showAdminLink = false }: SiteNavProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const canManage = showAdminLink || Boolean(rootData?.showAdminLink);
  const topicItems = rootData?.categories ?? [];
  const [isOpen, setIsOpen] = useState(false);
  // The menu shows either its links or, in place, the settings (with a way back).
  const [view, setView] = useState<"main" | "settings">("main");
  useEffect(() => { if (!isOpen) { const timer = window.setTimeout(() => setView("main"), 300); return () => window.clearTimeout(timer); } }, [isOpen]);
  // Hidden once the library already runs as an installed app.
  const [canInstall, setCanInstall] = useState(false);
  // Not offered when already installed, nor in Telegram's Mini App (its SDK may arrive a moment later).
  useEffect(() => {
    const check = () => setCanInstall(!isInstalledApp() && !isTelegramMiniApp());
    check();
    const later = window.setTimeout(check, 1500);
    return () => window.clearTimeout(later);
  }, []);
  // The Mini App signs its reader in by itself, so signing out there would not last.
  const [inMiniApp, setInMiniApp] = useState(true);
  useEffect(() => setInMiniApp(Boolean((window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData)), []);
  const account = rootData?.account ?? null;
  const location = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setIsOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])') ?? [],
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
      {/* Always mounted so it can fade out; a tap anywhere outside the menu closes it. */}
      <button
        className="menu-scrim fixed inset-0 z-40 cursor-default border-0 p-0"
        data-open={isOpen || undefined}
        type="button"
        tabIndex={-1}
        aria-hidden={!isOpen}
        aria-label="Փակել մենյուն"
        onClick={() => setIsOpen(false)}
      />

      <nav
        ref={dialogRef}
        className={`fixed right-[calc(var(--tg-inset-right,0px)+12px)] bottom-[calc(var(--tg-inset-bottom,0px)+12px)] z-50 grid justify-items-end transition-transform duration-200 min-[960px]:right-[calc(var(--tg-inset-right,0px)+max(24px,calc((100vw-1180px)/2+24px)))] ${isOpen ? "" : "pointer-events-none"}`}
        aria-label="Հիմնական նավիգացիա"
        aria-modal={isOpen || undefined}
        role={isOpen ? "dialog" : undefined}
      >
        <div className="menu-panel mb-3 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-[24px] p-2.5" data-open={isOpen || undefined} aria-hidden={!isOpen}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            {view === "settings" ? (
              <button className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-1 text-[13px] font-bold text-gold-bright" type="button" onClick={() => setView("main")}>
                <ArrowLeft aria-hidden="true" size={17} /> Կարգավորումներ
              </button>
            ) : <span className="text-[13px] font-bold text-ink">Մենյու</span>}
            <button className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted hover:text-ink" type="button" onClick={() => setIsOpen(false)} aria-label="Փակել մենյուն">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {view === "settings" ? (
            <div className="menu-view no-scrollbar max-h-[min(72svh,660px)] overflow-y-auto overscroll-contain pr-0.5" key="settings"><SettingsPanel /></div>
          ) : (
          <div className="menu-view no-scrollbar grid max-h-[min(72svh,660px)] gap-3 overflow-y-auto overscroll-contain pr-0.5" key="main">
            <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label="Հիմնական էջեր">
              {quickItems.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink className={({ isActive }) => `flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-1 text-center text-[11px] font-semibold no-underline outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)] ${isActive ? "border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/10%)] text-gold-bright" : "border-glass-border bg-subtle text-muted hover:text-ink"}`} to={to} end={end} tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
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
                        <NavLink className={({ isActive }) => `${linkClass} ${isActive ? "bg-[rgb(217_181_111/10%)] text-gold-bright" : ""}`} to={sectionPath(topic)} tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] text-gold-bright" data-telegram-emoji-id={topic.iconEmojiId ?? undefined}><CategoryIcon categoryId={topic.id} categoryName={topic.name} aria-hidden="true" size={16} strokeWidth={1.8} /></span>
                          <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                          {/* A closed Telegram topic only means that just admins post there; readers aren't told. */}
                          {topic.status === "hidden" ? <span className="text-[10px] text-faint">թաքցված</span> : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="grid gap-2 border-t border-glass-border px-1 pt-3" aria-labelledby="menu-settings">
              <h2 className="m-0 px-1 text-[11px] font-bold tracking-[1.2px] text-gold uppercase" id="menu-settings">Կարգավորումներ</h2>
              <button className={`${linkClass} w-full cursor-pointer border-0 bg-transparent text-left`} type="button" tabIndex={isOpen ? 0 : -1} onClick={() => setView("settings")}>
                <span className="grid size-8 place-items-center rounded-[10px] border border-glass-border bg-subtle text-gold"><Settings2 aria-hidden="true" size={17} /></span>
                <span className="flex-1">Թեմա, տառաչափ, տառատեսակ…</span>
                <ChevronRight aria-hidden="true" size={17} className="text-faint" />
              </button>
              {canInstall ? (
                <button className={`${linkClass} w-full cursor-pointer border-0 bg-transparent text-left`} type="button" tabIndex={isOpen ? 0 : -1} onClick={() => { setIsOpen(false); window.dispatchEvent(new Event(INSTALL_REQUEST_EVENT)); }}>
                  <span className="grid size-8 place-items-center rounded-[10px] border border-glass-border bg-subtle text-gold"><Smartphone aria-hidden="true" size={17} /></span>
                  Ավելացնել գլխավոր էկրանին
                </button>
              ) : null}
              {canManage ? (
                <NavLink className={linkClass} to="/admin" tabIndex={isOpen ? 0 : -1}><span className="grid size-8 place-items-center rounded-[10px] border border-glass-border bg-subtle text-gold"><Settings aria-hidden="true" size={17} /></span>Կառավարում</NavLink>
              ) : null}
            </section>

            {/* Sign-in, last in the menu where people look for it; it leads to «Իմ անկյունը». */}
            {rootData && !rootData.signedIn ? (
              <NavLink className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-3 text-[13.5px] font-bold text-gold-bright no-underline outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]" to="/saved" tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                <LogIn aria-hidden="true" size={17} /> Մուտք գործել
              </NavLink>
            ) : null}
            {account && (account.source === "google" || !inMiniApp) ? (
              <Form className="flex items-center justify-between gap-3 border-t border-glass-border px-2 pt-3 text-[12.5px] text-muted" method="post" action="/auth/logout" onSubmit={() => setIsOpen(false)}>
                <span className="min-w-0 truncate">{account.name} <span className="text-faint">· {account.source === "google" ? "Google" : "Telegram"}</span></span>
                <button className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(205_70_55/45%)] bg-[rgb(205_70_55/10%)] px-3.5 py-1.5 text-[12.5px] font-bold text-[rgb(190_60_45)]" type="submit" tabIndex={isOpen ? 0 : -1}>
                  <LogOut aria-hidden="true" size={15} /> Ելք
                </button>
              </Form>
            ) : null}
          </div>
          )}
        </div>

        <ReminderIndicator hidden={isOpen} />
        <button
          ref={triggerRef}
          className={`relative grid size-[62px] cursor-pointer place-items-center rounded-full border border-[var(--fab-border)] bg-[var(--fab-bg)] p-0 shadow-[var(--fab-shadow)] backdrop-blur-xl outline-none transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-[rgb(217_181_111/26%)] active:scale-95 pointer-events-auto hover:-translate-y-0.5`}
          type="button"
          aria-label={isOpen ? "Փակել մենյուն" : "Բացել մենյուն"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <img className="pointer-events-none absolute size-[56px] object-contain opacity-90 motion-safe:animate-[floating-wheat_24s_linear_infinite]" src={CrownWreath} width={256} height={256} alt="" aria-hidden="true" />
          <span className="gold-mark pointer-events-none relative size-[25px]" style={{ "--mark": `url(${ArmenianEternity})` } as React.CSSProperties} aria-hidden="true" />
        </button>
      </nav>
    </>
  );
});
