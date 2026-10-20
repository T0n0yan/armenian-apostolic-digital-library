import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

/**
 * A thin gold bar at the top while a page is loading, so a tap always shows that something is
 * happening, even on a slow connection. It creeps toward the end and finishes when the page is in.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px]" aria-hidden="true" style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms" }}>
      <div className="h-full bg-[linear-gradient(90deg,#b07d2e,#f0d397,#b07d2e)] shadow-[0_0_10px_rgb(240_211_151/80%)]" style={{ width: `${progress * 100}%`, transition: "width 250ms ease-out" }} />
    </div>
  );
}
