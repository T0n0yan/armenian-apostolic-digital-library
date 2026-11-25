import { ArrowLeft, BellRing, Bookmark, Church, CircleHelp, LogIn, LogOut, Mail, Search, Settings, Settings2, Smartphone, X } from "lucide-react";
import { clearPersonalStorage } from "../utils/personal-storage";
import { UNREAD_EVENT } from "./private-chat-presence";
import { PRIVATE_CHAT_OPEN } from "../utils/private-chat";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Form, NavLink, useLocation, useRouteLoaderData } from "react-router";

import ArmenianEternity from "../assets/armenian-eternity.svg";
import CrownWreath from "../assets/crown-olive-wreath.webp";
import CrownWreathSmall from "../assets/crown-olive-wreath-112.webp";
import type { loader as rootLoader } from "../root";
import { CategoryIcon } from "./category-icon";
import { PlacesIcon } from "./topic-icons";
import { ReminderIndicator, ReminderSheet } from "./reminder-indicator";
import { useActiveReminders } from "../utils/reminder-store";
import { INSTALL_REQUEST_EVENT, isInstalledApp, isTelegramMiniApp } from "./install-prompt";
import { SettingsPanel } from "./settings-panel";
import { sectionPath } from "../utils/material-path";
import { getCategoryImage } from "../utils/category-image";
import { preloadArt } from "./art-image";

// Սերվերում useLayoutEffect չկա (glossary-layer.tsx-ի նման)։
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type SiteNavProps = { showAdminLink?: boolean };

/** Երբ է վերջին անգամ բերվել բաժնի տվյալը. բրաուզերը այն պահում է 30 վրկ (`workers/app.ts`, `forClient`)։ */
const warmedAt = new Map<string, number>();

function warmSections(topics: { id: string; name?: string | null; slug: string }[], current: string) {
  for (const topic of topics) {
    const path = sectionPath(topic);
    if (path === current || Date.now() - (warmedAt.get(path) ?? 0) < 25_000) continue;
    warmedAt.set(path, Date.now());
    // Նույն հասցեն, ինչ React Router-ը կխնդրի բաժինը բացելիս (route-ի id-ն՝ "section", app/routes.ts)։
    void fetch(`${path}.data?_routes=section`, { priority: "low" } as RequestInit).catch(() => undefined);
    void preloadArt(getCategoryImage(topic.id, topic.name), 0);
  }
}

const quickItems = [
  { to: "/", label: "Գլխավոր", icon: Church, end: true },
  { to: "/search", label: "Որոնում", icon: Search, end: false },
  { to: "/saved", label: "Իմ անկյունը", icon: Bookmark, end: false },
] as const;


// Փոքր սալիկ (պատկերակ վերևում, անունը տակը)՝ գլխավոր էջեր և «Այլ»։
const smallTileClass = "menu-tile flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-button px-0.5 text-center text-[11px] leading-tight font-semibold text-muted no-underline outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]";
// Միայն պատկերակով սալիկ (կարգավորումներ, օգնություն, տեղադրել)։
const iconTileClass = "menu-tile grid min-h-12 cursor-pointer place-items-center rounded-button text-gold no-underline outline-none hover:text-gold-bright focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]";
// Ամբողջ լայնությամբ սալիկ՝ պատկերակ և անուն մեկ տողում (կառավարում, մուտք)։
const rowTileClass = "menu-tile flex min-h-12 items-center justify-center gap-2 rounded-button px-3 text-[13px] font-semibold no-underline outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]";
// Բաժնի սալիկ մենյուում (2 սյուն)։
const tileClass = "menu-tile relative flex min-h-[54px] items-center gap-2 rounded-button px-2 py-2 text-[12px] font-semibold text-muted no-underline outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/34%)]";

export const SiteNav = memo(function SiteNav({ showAdminLink = false }: SiteNavProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  // Անձնական չատի չկարդացվածները՝ կենդանի (PrivateChatPresence-ից), սկզբում՝ root-ից։
  const [chatUnread, setChatUnread] = useState(rootData?.privateChat?.unread ?? 0);
  useEffect(() => {
    const onUnread = (event: Event) => setChatUnread(Number((event as CustomEvent<number>).detail) || 0);
    window.addEventListener(UNREAD_EVENT, onUnread);
    return () => window.removeEventListener(UNREAD_EVENT, onUnread);
  }, []);
  const canManage = showAdminLink || Boolean(rootData?.showAdminLink);
  const permissions: string[] = rootData?.adminPermissions ?? [];
  const topicItems = rootData?.categories ?? [];
  const [isOpen, setIsOpen] = useState(false);
  // Փակվելու անիմացիայի ընթացքում (300 մվ) մշուշը պահելու համար (app.css, .menu-panel[data-closing])։
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(false);
  // Layout effect՝ նկարելուց առաջ, որ առաջին կադրն էլ առանց մշուշի չմնա։
  useIsomorphicLayoutEffect(() => {
    if (isOpen) { wasOpen.current = true; setClosing(false); return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), 320);
    return () => window.clearTimeout(timer);
  }, [isOpen]);
  // The menu shows either its links or, in place, the settings (with a way back).
  const [view, setView] = useState<"main" | "settings">("main");
  // Հիշեցումների պատուհանը (ներքևից)՝ մենյուի սալիկից կամ զանգած զանգակից։
  const [remindersOpen, setRemindersOpen] = useState(false);
  // Դրված հիշեցումները՝ մենյուում «Իմ անկյունը»-ի կողքին (միայն երբ կան)։
  const reminderCount = useActiveReminders().length;
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
  // Հեռախոսի «տվյալ խնայել» ռեժիմ (Chrome/Android). մենյուն այդ դեպքում ոչինչ նախապես չի բերում։
  const [saveData, setSaveData] = useState(true);
  useEffect(() => setSaveData(Boolean((navigator as { connection?: { saveData?: boolean } }).connection?.saveData)), []);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setIsOpen(false), [location.pathname]);
  // Մենյուն բացելիս բաժինների տվյալը (միասին ~40 ԿԲ) և գլխի նկարը նախապես բերվում են, որ սեղմելիս էջը
  // միանգամից բացվի (առաջ 0,3–0,9 վրկ սպասում էր և ցույց էր տալիս կմախքը)։ Տվյալ խնայելու ռեժիմում՝ ոչ։
  useEffect(() => {
    if (!isOpen || saveData) return;
    const timer = window.setTimeout(() => warmSections(topicItems, location.pathname), 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    // Էջը չի «սառեցվում» (body position: fixed). դա ամբողջ էջը նորից էր նկարում ու մենյուի բացվելը
    // կտրտում էր։ iPhone-ը անտեսում է touch-action-ը և overscroll-behavior-ը, երբ մենյուն ոլորվելու տեղ
    // չունի, ու ոլորում է ետևի էջը։ Դրա համար մատի շարժումը կանգնեցվում է, բացի մենյուի ներսում ոլորելուց։
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => { startY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1 || !event.cancelable) { if (event.cancelable) event.preventDefault(); return; }
      // Տառաչափի սահիչը քաշվում է կողքից. դրան չխանգարել։
      if ((event.target as Element | null)?.closest?.("input[type='range']") && dialogRef.current?.contains(event.target as Node)) return;
      const scroller = (event.target as Element | null)?.closest?.(".menu-view") as HTMLElement | null;
      const dy = touch.clientY - startY;
      startY = touch.clientY;
      const canScroll = scroller && dialogRef.current?.contains(scroller) && scroller.scrollHeight > scroller.clientHeight
        && !(dy > 0 && scroller.scrollTop <= 0) && !(dy < 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1);
      if (!canScroll) event.preventDefault();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    const unlock = () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
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
      unlock();
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
        <div className="menu-panel mb-3 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-panel p-3" data-open={isOpen || undefined} data-closing={closing || undefined} aria-hidden={!isOpen}>
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
            <div className="menu-view no-scrollbar rounded-card max-h-[min(72svh,660px)] overflow-y-auto overscroll-contain pr-0.5" key="settings"><SettingsPanel /></div>
          ) : (
          <div className="menu-view no-scrollbar rounded-card grid max-h-[min(72svh,660px)] gap-3 overflow-y-auto overscroll-contain pr-0.5" key="main">
            <ul className={`m-0 grid list-none gap-1.5 p-0 ${reminderCount ? "grid-cols-4" : "grid-cols-3"}`} aria-label="Հիմնական էջեր">
              {quickItems.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink className={({ isActive }) => `${smallTileClass} ${isActive ? "text-gold-bright" : ""}`} to={to} end={end} tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} className="text-gold" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
              {reminderCount ? (
                <li>
                  <button className={`${smallTileClass} relative w-full`} type="button" tabIndex={isOpen ? 0 : -1} onClick={() => { setIsOpen(false); setRemindersOpen(true); }} aria-haspopup="dialog">
                    <BellRing aria-hidden="true" size={19} strokeWidth={1.8} className="text-gold" />
                    <span>Հիշեցումներ</span>
                    <span className="absolute top-1.5 right-2 grid min-w-[16px] place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-1 text-[10px] font-bold leading-[16px] text-[#2a1708]">{reminderCount}</span>
                  </button>
                </li>
              ) : null}
            </ul>

            {topicItems.length > 0 ? (
              <section className="grid gap-1" aria-labelledby="menu-topics">
                <h2 className="m-0 px-2 text-[11px] font-bold tracking-[1.2px] text-gold uppercase" id="menu-topics">Բաժիններ</h2>
                <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
                  {topicItems.map((topic) => {
                    return (
                      <li key={topic.id}>
                        <NavLink className={({ isActive }) => `${tileClass} ${isActive ? "text-gold-bright" : ""}`} to={sectionPath(topic)} tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] text-gold-bright" data-telegram-emoji-id={topic.iconEmojiId ?? undefined}><CategoryIcon categoryId={topic.id} categoryName={topic.name} aria-hidden="true" size={16} strokeWidth={1.8} /></span>
                          <span className="line-clamp-2 min-w-0 flex-1 leading-tight">{topic.name}</span>
                          {/* A closed Telegram topic only means that just admins post there; readers aren't told. */}
                          {topic.status === "hidden" ? <span className="absolute top-1 right-2 text-[9px] text-faint">թաքցված</span> : null}
                        </NavLink>
                      </li>
                    );
                  })}
                  <li>
                    <NavLink className={({ isActive }) => `${tileClass} ${isActive ? "text-gold-bright" : ""}`} to="/places" tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] text-gold-bright"><PlacesIcon aria-hidden="true" size={17} /></span>
                      <span className="line-clamp-2 min-w-0 flex-1 leading-tight">Սրբավայրեր</span>
                    </NavLink>
                  </li>
                </ul>
              </section>
            ) : null}

            <section className="grid gap-2 border-t border-edge pt-3" aria-label="Կարգավորումներ և օգնություն">
              {/* Վերնագիրը և նամակների կոճակը մեկ տողում (նամակները՝ միայն երկու կողմին, root-ը ուրիշներին null է տալիս)։ */}
              <div className="flex min-h-7 items-center justify-between">
                <h2 className="m-0 px-2 text-[11px] font-bold tracking-[1.2px] text-gold uppercase">Կարգավորումներ</h2>
                {/* Չատը փակ է (PRIVATE_CHAT_OPEN), կոճակը թաքցված է։ */}
                {rootData?.privateChat && PRIVATE_CHAT_OPEN ? (
                  <NavLink className="relative mr-1 grid size-7 place-items-center rounded-full text-faint no-underline hover:text-gold-bright" to="/namak" aria-label="Նամակներ" title="Նամակներ" tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                    <Mail aria-hidden="true" size={15} />
                    {chatUnread > 0 ? <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-gold-bright" /> : null}
                  </NavLink>
                ) : null}
              </div>
              {/* Միայն պատկերակներ (անունը՝ title-ում և էկրանի ընթերցողի համար), նույն ոճով։ */}
              <ul className={`m-0 grid list-none gap-1.5 p-0 ${canInstall ? "grid-cols-3" : "grid-cols-2"}`}>
                <li>
                  <button className={`${iconTileClass} w-full`} type="button" tabIndex={isOpen ? 0 : -1} onClick={() => setView("settings")} aria-label="Լույս, տառատեսակ, տառաչափ" title="Լույս, տառատեսակ, տառաչափ">
                    <Settings2 aria-hidden="true" size={20} strokeWidth={1.8} />
                  </button>
                </li>
                <li>
                  <NavLink className={({ isActive }) => `${iconTileClass} ${isActive ? "text-gold-bright" : ""}`} to="/ognutyun" end tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)} aria-label="Օգնություն՝ տեսանյութեր" title="Օգնություն">
                    <CircleHelp aria-hidden="true" size={20} strokeWidth={1.8} />
                  </NavLink>
                </li>
                {canInstall ? (
                  <li>
                    <button className={`${iconTileClass} w-full`} type="button" tabIndex={isOpen ? 0 : -1} onClick={() => { setIsOpen(false); window.dispatchEvent(new Event(INSTALL_REQUEST_EVENT)); }} aria-label="Ավելացնել գլխավոր էկրանին" title="Ավելացնել գլխավոր էկրանին">
                      <Smartphone aria-hidden="true" size={20} strokeWidth={1.8} />
                    </button>
                  </li>
                ) : null}
              </ul>
              {/* «Կառավարում» is the owner's; another admin sees only the pages the owner allowed. Առանձին տող՝ անունով։ */}
              {(canManage ? [["/admin", "Կառավարում"]] : [
                ...(permissions.includes("places") ? [["/admin/places", "Սրբավայրերի կառավարում"]] : []),
                ...(permissions.includes("people") ? [["/admin/people", "Օգտատերեր"]] : []),
                ...(permissions.includes("glossary") ? [["/admin/glossary", "Բառարան"]] : []),
                ...(permissions.includes("help") ? [["/admin/help", "Օգնության տեսանյութեր"]] : []),
              ]).map(([to, label]) => (
                <NavLink key={to} className={({ isActive }) => `${rowTileClass} ${isActive ? "text-gold-bright" : "text-ink"}`} to={to} end tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                  <Settings aria-hidden="true" size={18} strokeWidth={1.8} className="text-gold" />{label}
                </NavLink>
              ))}
            </section>

            {/* Sign-in, last in the menu where people look for it; it leads to «Իմ անկյունը». */}
            {rootData && !rootData.signedIn ? (
              <NavLink className={`${rowTileClass} font-bold text-gold-bright`} to="/saved" tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)}>
                <LogIn aria-hidden="true" size={17} /> Մուտք գործել
              </NavLink>
            ) : null}
            {account && (account.source === "google" || !inMiniApp) ? (
              <div className="grid gap-1.5 border-t border-edge px-2 pt-3">
                <Form className="flex items-center justify-between gap-3 text-[12.5px] text-muted" method="post" action="/auth/logout" onSubmit={() => { clearPersonalStorage(); setIsOpen(false); }}>
                  <span className="min-w-0 truncate">{account.name || "Իմ հաշիվը"} <span className="text-faint">· {account.source === "google" ? "Google" : "Telegram"}</span></span>
                  <button className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(205_70_55/45%)] bg-[rgb(205_70_55/10%)] px-3.5 py-1.5 text-[12.5px] font-bold text-[rgb(190_60_45)]" type="submit" tabIndex={isOpen ? 0 : -1}>
                    <LogOut aria-hidden="true" size={15} /> Ելք
                  </button>
                </Form>
                <Form method="post" action="/auth/logout" onSubmit={(event) => { if (!window.confirm("Դուրս գալ բոլոր սարքերից (հեռախոս, համակարգիչ, Telegram)։")) event.preventDefault(); else { clearPersonalStorage(); setIsOpen(false); } }}>
                  <input type="hidden" name="scope" value="all" />
                  <button className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-faint underline underline-offset-2" type="submit" tabIndex={isOpen ? 0 : -1}>Ելք բոլոր սարքերից</button>
                </Form>
              </div>
            ) : null}
          </div>
          )}
        </div>

        {/* Զանգը թաքնված է նաև փակվելու ընթացքում. առաջ անմիջապես հայտնվում էր ու մենյուն վեր էր հրում։ */}
        <ReminderIndicator hidden={isOpen || closing} onOpen={() => setRemindersOpen(true)} />
        <button
          ref={triggerRef}
          className={`relative grid size-[62px] cursor-pointer place-items-center paper-fab rounded-full p-0 outline-none transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-[rgb(217_181_111/26%)] active:scale-95 pointer-events-auto hover:-translate-y-0.5`}
          type="button"
          aria-label={isOpen ? "Փակել մենյուն" : "Բացել մենյուն"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {/* Պսակը պտտվում է միայն մենյուն բացելիս/փակելիս. առաջ անընդհատ էր պտտվում, ու հեռախոսը ամեն էջում
              վայրկյանում 60 անգամ նորից էր նկարում էկրանը, նույնիսկ երբ ոչինչ չէր կատարվում (տաքանում և դանդաղում էր)։ */}
          <img className={`pointer-events-none absolute size-[56px] object-contain opacity-90 transition-transform duration-700 ease-out ${isOpen ? "rotate-[120deg]" : ""}`} src={CrownWreathSmall} srcSet={`${CrownWreathSmall} 112w, ${CrownWreath} 168w`} sizes="56px" fetchPriority="low" width={168} height={168} alt="" aria-hidden="true" />
          <span className="gold-mark pointer-events-none relative size-[25px]" style={{ "--mark": `url(${ArmenianEternity})` } as React.CSSProperties} aria-hidden="true" />
          {/* Փոքր կետ՝ անձնական չատում չկարդացված կա (միայն երկու կողմին)։ */}
          {chatUnread > 0 && !isOpen ? <span className="pointer-events-none absolute right-2.5 top-2.5 size-2.5 rounded-full bg-gold-bright" aria-hidden="true" /> : null}
        </button>
      </nav>
      <ReminderSheet open={remindersOpen} onClose={() => setRemindersOpen(false)} />
    </>
  );
});
