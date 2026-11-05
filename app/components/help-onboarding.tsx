import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { HelpVideoSheet } from "./help-video-sheet";
import { HELP_ONBOARDING_KEY, type HelpVideo } from "../utils/help-videos";

// Այս էջերում ուղեցույցը չի բացվում (ադմին, մուտք, հենց Օգնության էջը)
const SKIP = /^\/(admin|auth|ognutyun|telegram)(\/|$)/u;

/**
 * Առաջին այցի ուղեցույց. նոր մարդուն (այս սարքում մեկ անգամ) ցույց է տալիս Օգնության տեսանյութերը հերթով,
 * «Բաց թողնել» կոճակով և «3 / 13» համարիչով։ Աշխատում է միայն երբ ադմինում միացված է (/api/help-videos)։
 */
export function HelpOnboarding() {
  const { pathname } = useLocation();
  const [videos, setVideos] = useState<HelpVideo[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try { if (localStorage.getItem(HELP_ONBOARDING_KEY)) return; } catch { return; }
    if (SKIP.test(pathname)) return;
    let cancelled = false;
    const start = Date.now();
    // Սպասել, մինչև կայքի բացման անիմացիան (մոմը) ավարտվի
    const wait = () => new Promise<void>((resolve) => {
      const check = () => (!document.querySelector(".candle-loader") || Date.now() - start > 12_000) ? resolve() : window.setTimeout(check, 300);
      window.setTimeout(check, 1200);
    });
    void wait().then(async () => {
      const data = await fetch("/api/help-videos").then((response) => response.json() as Promise<{ onboarding?: boolean; videos?: HelpVideo[] }>).catch(() => null);
      if (cancelled || !data?.onboarding || !data.videos?.length) return;
      try { localStorage.setItem(HELP_ONBOARDING_KEY, new Date().toISOString()); } catch { /* պահեստը փակ է */ }
      setVideos(data.videos);
    });
    return () => { cancelled = true; };
    // Միայն առաջին բացվելիս
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => setVideos(null), []);
  if (!videos) return null;
  return <HelpVideoSheet videos={videos} index={index} onIndex={setIndex} onClose={close} mode="onboarding" />;
}
