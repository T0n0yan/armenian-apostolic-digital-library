import { ArrowLeft, Bookmark, Church, Search, Settings } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router";

import { ThemeToggle } from "./theme-toggle";

type SiteNavProps = {
  actionHref?: string;
  actionLabel?: string;
};

export const SiteNav = memo(function SiteNav({
  actionHref,
  actionLabel,
}: SiteNavProps) {
  return (
    <nav
      className="sticky top-[calc(var(--tg-content-safe-area-inset-top,0px)+8px)] z-20 flex min-h-14 items-center justify-between gap-2.5 rounded-[18px] border border-glass-border bg-[linear-gradient(130deg,rgb(255_255_255/18%),transparent_48%),var(--nav-surface)] py-2 pr-2.5 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/18%),0_16px_44px_rgb(2_0_7/18%)] backdrop-blur-xl backdrop-saturate-150 min-[560px]:top-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] min-[560px]:min-h-[58px] min-[560px]:rounded-[20px] min-[560px]:py-[9px] min-[560px]:pr-2.5 min-[560px]:pl-3.5"
      aria-label="Հիմնական նավիգացիա"
    >
      <Link
        className="inline-flex min-w-0 items-center gap-[9px] text-[0.79rem] leading-[1.2] font-bold text-inherit no-underline outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3 min-[560px]:text-[0.84rem]"
        to="/"
      >
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] border border-[rgb(240_211_151/26%)] bg-[linear-gradient(145deg,rgb(217_181_111/24%),rgb(93_48_108/34%))] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/15%)]" aria-hidden="true">
          <Church size={19} strokeWidth={1.8} />
        </span>
        <span className="hidden overflow-hidden text-ellipsis whitespace-nowrap min-[720px]:inline">Թվային գրադարան</span>
      </Link>
      <span className="flex items-center gap-1.5">
        {actionHref && actionLabel ? (
          <Link
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(217_181_111/22%)] bg-[rgb(217_181_111/8%)] px-3 text-[0.79rem] leading-[1.2] font-bold text-gold-bright no-underline outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3 min-[560px]:text-[0.84rem]"
            to={actionHref}
            aria-label={actionLabel}
            title={actionLabel}
          >
            {actionHref === "/admin" ? (
              <Settings aria-hidden="true" size={18} strokeWidth={1.9} />
            ) : (
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.9} />
            )}
            <span className="hidden min-[720px]:inline">{actionLabel.replace(/^←\s*/, "")}</span>
          </Link>
        ) : null}
        <Link
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-glass-border bg-subtle p-0 text-muted transition-[color,transform,background] duration-[160ms] outline-none hover:-translate-y-px hover:bg-glass-highlight hover:text-gold-bright focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3"
          to="/search"
          aria-label="Որոնում"
          title="Որոնում"
        >
          <Search aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>
        <Link
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-glass-border bg-subtle p-0 text-muted transition-[color,transform,background] duration-[160ms] outline-none hover:-translate-y-px hover:bg-glass-highlight hover:text-gold-bright focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3"
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
