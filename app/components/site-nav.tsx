import { Bookmark, Church, Search, Settings } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router";

import { ThemeToggle } from "./theme-toggle";
import { focusRing, iconButton } from "./ui-styles";

type SiteNavProps = {
  showAdminLink?: boolean;
};

export const SiteNav = memo(function SiteNav({
  showAdminLink = false,
}: SiteNavProps) {
  return (
    <nav
      className="fixed right-[calc(var(--tg-content-safe-area-inset-right,0px)+12px)] bottom-[calc(var(--tg-content-safe-area-inset-bottom,0px)+10px)] left-[calc(var(--tg-content-safe-area-inset-left,0px)+12px)] z-20 flex min-h-[60px] items-center justify-between gap-2.5 rounded-[20px] border border-glass-border bg-[linear-gradient(130deg,rgb(255_255_255/18%),transparent_48%),var(--nav-surface)] px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/18%),0_16px_44px_rgb(2_0_7/22%)] backdrop-blur-xl backdrop-saturate-150 min-[560px]:right-[calc(var(--tg-content-safe-area-inset-right,0px)+20px)] min-[560px]:bottom-[calc(var(--tg-content-safe-area-inset-bottom,0px)+14px)] min-[560px]:left-[calc(var(--tg-content-safe-area-inset-left,0px)+20px)] min-[560px]:min-h-[62px] min-[560px]:rounded-[22px] min-[560px]:px-3.5 min-[960px]:right-auto min-[960px]:left-1/2 min-[960px]:w-[min(720px,calc(100%-64px))] min-[960px]:-translate-x-1/2"
      aria-label="Հիմնական նավիգացիա"
    >
      <Link
        className={`inline-flex min-w-0 items-center gap-[9px] text-[13px] leading-[16px] font-bold text-inherit no-underline ${focusRing}`}
        to="/"
      >
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] border border-[rgb(240_211_151/26%)] bg-[linear-gradient(145deg,rgb(217_181_111/24%),rgb(93_48_108/34%))] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/15%)]" aria-hidden="true">
          <Church size={19} strokeWidth={1.8} />
        </span>
        <span className="hidden overflow-hidden text-ellipsis whitespace-nowrap min-[960px]:inline">Հոգևոր ժառանգություն</span>
      </Link>
      <span className="flex items-center gap-1.5">
        {showAdminLink ? (
          <Link
            className={`inline-flex min-h-[36px] shrink-0 items-center gap-[6px] rounded-[12px] border border-[rgb(217_181_111/22%)] bg-[rgb(217_181_111/8%)] px-[12px] text-[13px] leading-[16px] font-bold text-gold-bright no-underline ${focusRing}`}
            to="/admin"
            aria-label="Կառավարում"
            title="Կառավարում"
          >
            <Settings aria-hidden="true" size={18} strokeWidth={1.9} />
            <span className="hidden min-[960px]:inline">Կառավարում</span>
          </Link>
        ) : null}
        <Link
          className={iconButton}
          to="/search"
          aria-label="Որոնում"
          title="Որոնում"
        >
          <Search aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>
        <Link
          className={iconButton}
          to="/saved"
          aria-label="Իմ անկյունը"
          title="Իմ անկյունը"
        >
          <Bookmark aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>
        <ThemeToggle />
      </span>
    </nav>
  );
});
