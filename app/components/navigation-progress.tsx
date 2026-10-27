import { useEffect, useState } from "react";
import { useLocation, useNavigation } from "react-router";

import { PageSkeleton } from "./page-skeleton";

/**
 * A thin gold bar at the top while a page is loading, so a tap always shows that something is
 * happening, even on a slow connection. It creeps toward the end and finishes when the page is in.
 * Going to another page that takes more than a moment also shows that page's outline (its
 * skeleton) in the page's own colours until it arrives.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const location = useLocation();
  const busy = navigation.state !== "idle";
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  // Only a move to another page (not a search on the same one, not sending a form) gets the outline.
  const target = navigation.state === "loading" && !navigation.formMethod && navigation.location.pathname !== location.pathname ? navigation.location.pathname : null;
  const [skeleton, setSkeleton] = useState<string | null>(null);
  useEffect(() => {
    if (!target) { setSkeleton(null); return; }
    const timer = window.setTimeout(() => setSkeleton(target), 250);
    return () => window.clearTimeout(timer);
  }, [target]);

  useEffect(() => {
    if (busy) {
      setVisible(true);
      setProgress(0.08);
      const timer = window.setInterval(() => setProgress((value) => value + (0.9 - value) * 0.08), 200);
      return () => window.clearInterval(timer);
    }
    if (!visible) return;
    setProgress(1);
    const hide = window.setTimeout(() => { setVisible(false); setProgress(0); }, 350);
    return () => window.clearTimeout(hide);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {skeleton ? <PageSkeleton pathname={skeleton} /> : null}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[2010] h-[3px]" aria-hidden="true" style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms" }}>
        <div className="h-full bg-[linear-gradient(90deg,#b07d2e,#f0d397,#b07d2e)] shadow-[0_0_10px_rgb(240_211_151/80%)]" style={{ width: `${progress * 100}%`, transition: "width 250ms ease-out" }} />
      </div>
    </>
  );
}
