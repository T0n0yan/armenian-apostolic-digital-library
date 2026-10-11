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
    <nav className="site-nav" aria-label="Հիմնական նավիգացիա">
      <Link className="site-nav-brand" to="/">
        <span className="site-nav-mark" aria-hidden="true">
          <Church size={19} strokeWidth={1.8} />
        </span>
        <span className="site-nav-brand-text">Թվային գրադարան</span>
      </Link>
      <span className="site-nav-controls">
        {actionHref && actionLabel ? (
          <Link
            className="site-nav-action"
            to={actionHref}
            aria-label={actionLabel}
            title={actionLabel}
          >
            {actionHref === "/admin" ? (
              <Settings aria-hidden="true" size={18} strokeWidth={1.9} />
            ) : (
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.9} />
            )}
            <span>{actionLabel.replace(/^←\s*/, "")}</span>
          </Link>
        ) : null}
        <Link
          className="site-nav-icon-button"
          to="/search"
          aria-label="Որոնում"
          title="Որոնում"
        >
          <Search aria-hidden="true" size={18} strokeWidth={1.9} />
        </Link>
        <Link
          className="site-nav-icon-button"
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
