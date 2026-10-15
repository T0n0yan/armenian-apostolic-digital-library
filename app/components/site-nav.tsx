import {Bookmark, Church, Search, Settings} from "lucide-react";
import {memo, useEffect, useRef, useState} from "react";
import {NavLink, useLocation, useRouteLoaderData} from "react-router";

import type {loader as rootLoader} from "../root";
import ArmenianEternity from "../assets/armenian-eternity.svg";
import CrownWreath from "../assets/crown-olive-wreath.webp";

type SiteNavProps = { showAdminLink?: boolean };

const navigationItems = [{to: "/", label: "Գլխավոր", icon: Church, end: true}, {
    to: "/search",
    label: "Որոնում",
    icon: Search
}, {to: "/saved", label: "Իմ անկյունը", icon: Bookmark},] as const;

const linkBase = "group/link grid grid-cols-[auto_52px] items-center gap-[9px] text-muted no-underline outline-none";
const labelClass = "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-[13px] border border-glass-border bg-nav-surface px-3 py-[7px] font-noto text-[13px] font-semibold shadow-[0_8px_24px_rgb(18_7_25/15%),inset_0_1px_0_rgb(255_255_255/16%)] backdrop-blur-[20px] backdrop-saturate-[170%]";
const iconClass = "grid size-[52px] place-items-center rounded-full border border-[rgb(217_181_111/27%)] bg-[linear-gradient(145deg,rgb(247_214_148/95%),rgb(205_153_72/94%))] text-[#3d263f] shadow-[inset_0_1px_0_rgb(255_255_255/52%),inset_0_-8px_16px_rgb(116_65_26/12%),0_9px_25px_rgb(28_10_34/22%)] transition-[transform,box-shadow,filter] duration-[180ms] group-hover/link:-translate-y-0.5 group-hover/link:brightness-[1.04] group-active/link:scale-[0.92] group-focus-visible/link:shadow-[0_0_0_4px_rgb(217_181_111/20%),inset_0_1px_0_rgb(255_255_255/52%),0_9px_25px_rgb(28_10_34/22%)]";

export const SiteNav = memo(function SiteNav({showAdminLink = false}: SiteNavProps) {
    const rootData = useRouteLoaderData<typeof rootLoader>("root");
    const canManage = showAdminLink || Boolean(rootData?.showAdminLink);
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();
    const menuRef = useRef<HTMLElement>(null);
    const items = canManage ? [...navigationItems, {
        to: "/admin",
        label: "Կարգավորումներ",
        icon: Settings,
        end: false
    }] : navigationItems;

    useEffect(() => setIsOpen(false), [location.pathname]);

    useEffect(() => {
        if (!isOpen) return;

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false);
        };
        const closeOutside = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
        };

        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("pointerdown", closeOutside);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("pointerdown", closeOutside);
        };
    }, [isOpen]);

    return (<nav
        ref={menuRef}
        className="fixed right-[calc(var(--tg-content-safe-area-inset-right,0px)+16px)] bottom-[calc(var(--tg-content-safe-area-inset-bottom,0px)+14px)] z-30 grid justify-items-end min-[960px]:right-[calc(var(--tg-content-safe-area-inset-right,0px)+max(24px,calc((100vw-1180px)/2+24px)))] min-[960px]:bottom-[calc(var(--tg-content-safe-area-inset-bottom,0px)+20px)]"
        aria-label="Հիմնական նավիգացիա"
    >
        <ul className={`absolute right-0.5 bottom-[70px] m-0 grid min-w-max list-none gap-2.5 p-0 ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
            aria-hidden={!isOpen}>
            {items.map(({to, label, icon: Icon, ...item}, index) => (<li
                className={`origin-right transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(0.2,0.9,0.24,1.24)] ${isOpen ? "translate-y-0 scale-100 opacity-100" : "translate-y-[18px] scale-[0.82] opacity-0"}`}
                style={{transitionDelay: isOpen ? `${index * 55}ms` : `${(items.length - index - 1) * 35}ms`}}
                key={to}
            >
                <NavLink
                    className={({isActive}) => `${linkBase} ${isActive ? "text-gold-bright [&>span:last-child]:shadow-[0_0_0_3px_rgb(217_181_111/18%),inset_0_1px_0_rgb(255_255_255/60%),0_10px_28px_rgb(28_10_34/25%)]" : ""}`}
                    to={to}
                    end={"end" in item ? item.end : false}
                    tabIndex={isOpen ? 0 : -1}
                    aria-label={label}
                >
                    <span className={labelClass}>{label}</span>
                    <span className={iconClass} aria-hidden="true">
                        <Icon size={22} strokeWidth={1.7}/>
                    </span>
                </NavLink>
            </li>))}
        </ul>

        <button
            className="relative flex items-center justify-center size-[60px] cursor-pointer rounded-full duration-[260ms]"
            type="button"
            aria-label={isOpen ? "Փակել նավիգացիան" : "Բացել նավիգացիան"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
        >
            <img
                className="pointer-events-none absolute block size-[60px] object-cover animate-[floating-wheat_60s_linear_infinite]"
                src={CrownWreath} width={256} height={256} alt="" aria-hidden="true"/>
            <img
                className="pointer-events-none z-1 block size-[27px] animate-[floating-wheat_30s_linear_infinite]"
                src={ArmenianEternity} width={48} height={48} alt="" aria-hidden="true"/>
        </button>
    </nav>);
});
