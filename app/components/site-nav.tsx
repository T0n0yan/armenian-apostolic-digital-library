import { memo } from "react";
import { Link } from "react-router";

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
          ✦
        </span>
        <span>Թվային գրադարան</span>
      </Link>
      {actionHref && actionLabel ? (
        <Link className="site-nav-action" to={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </nav>
  );
});
