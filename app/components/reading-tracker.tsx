import { useEffect } from "react";

import { localDay } from "../utils/local-day";

const READ_AFTER_MS = 60_000;

/**
 * Notes that the reader really read a material today: the page kept on screen for a minute, or a
 * recording on it played to (nearly) the end. Feeds the reading calendar in «Իմ անկյունը».
 */
export function ReadingTracker({ materialId, enabled }: { materialId: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    let visibleMs = 0;
    let last = Date.now();
    const send = (kind: "read" | "listen") => {
      if (done) return;
      done = true;
      void fetch("/api/reading-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, day: localDay(), kind }) }).catch(() => null);
    };
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") visibleMs += now - last;
      last = now;
      if (visibleMs >= READ_AFTER_MS) send("read");
    }, 2_000);
    const onTime = (event: Event) => {
      const media = event.target;
      if (media instanceof HTMLMediaElement && Number.isFinite(media.duration) && media.duration > 0 && (event.type === "ended" || media.currentTime / media.duration >= 0.9)) send("listen");
    };
    document.addEventListener("timeupdate", onTime, true);
    document.addEventListener("ended", onTime, true);
    return () => { window.clearInterval(tick); document.removeEventListener("timeupdate", onTime, true); document.removeEventListener("ended", onTime, true); };
  }, [enabled, materialId]);
  return null;
}
