export type MediaPlaybackState = "initial" | "metadata" | "buffering" | "seeking" | "playing" | "paused" | "error-network" | "error-decode" | "error-unsupported" | "error";
export type MediaPlaybackEvent = "load-start" | "metadata-ready" | "can-play" | "waiting" | "stalled" | "seeking" | "seeked" | "playing" | "pause" | "error" | "retry";

export function mediaPlaybackStateForEvent(
  current: MediaPlaybackState,
  event: MediaPlaybackEvent,
  media: { paused?: boolean; seeking?: boolean; hasCurrentData?: boolean; errorCode?: number | null; canPlayType?: boolean } = {},
): MediaPlaybackState {
  if (event === "retry") return "initial";
  if (event === "load-start") return "metadata";
  if (event === "waiting" || event === "stalled") return "buffering";
  if (event === "seeking") return "seeking";
  if (event === "playing") return "playing";
  if (event === "error") {
    // MEDIA_ERR_ABORTED is a normal outcome of a cancelled load/seek and must
    // not replace the player with a terminal unavailable state.
    if (media.errorCode === 1) return current === "seeking" ? "seeking" : "buffering";
    if (media.errorCode === 2) return "error-network";
    if (media.errorCode === 3) return "error-decode";
    // Android's WebView (Telegram, Chrome) also reports a file that never arrived (no connection,
    // a stale DNS answer, a bad certificate) as SRC_NOT_SUPPORTED; only a type the browser says it
    // cannot play is really unsupported.
    if (media.errorCode === 4) return media.canPlayType === false ? "error-unsupported" : "error-network";
    return "error";
  }
  if (event === "metadata-ready" || event === "can-play" || event === "seeked") return media.paused === false ? "playing" : "paused";
  if (event === "pause") return media.seeking || media.hasCurrentData === false ? current : "paused";
  return current;
}

export function mediaPlaybackLabel(state: MediaPlaybackState) {
  switch (state) {
    case "initial": return "Մեդիան պատրաստվում է բեռնվել…";
    case "metadata": return "Բեռնվում են մեդիայի տվյալները…";
    case "buffering": return "Բեռնվում է հաջորդ հատվածը…";
    case "seeking": return "Անցում ընտրված հատվածին…";
    case "playing": return "Նվագարկվում է";
    case "paused": return "Դադարեցված է";
    case "error-network": return "Ֆայլը չհաջողվեց բեռնել։ Ստուգեք ինտերնետ կապը և կրկին փորձեք։";
    case "error-decode": return "Մեդիա ֆայլը չհաջողվեց վերծանել։";
    case "error-unsupported": return "Այս բրաուզերը չի աջակցում ֆայլի ձևաչափը։ Փորձեք այլ բրաուզերով։";
    case "error": return "Մեդիան չբեռնվեց։ Կարող եք կրկին փորձել։";
  }
}

export function isRetryableMediaError(state: MediaPlaybackState) {
  return state === "error-network" || state === "error" || state === "error-decode";
}

/** Whether the browser says it can play this type at all ("" means no; unknown types count as yes). */
export function browserCanPlay(element: HTMLMediaElement, mimeType: string | null | undefined) {
  if (!mimeType) return true;
  return element.canPlayType(mimeType) !== "";
}

/**
 * The addresses to try for a file, in order: its own, the site's /media copy, then the first one
 * again past every cache. `attempt` counts retries the reader asked for, so each gets a fresh one.
 */
export function mediaSources(url: string, fallbackUrl?: string | null, attempt = 0) {
  const fresh = (value: string) => `${value}${value.includes("?") ? "&" : "?"}retry=${attempt + 1}`;
  const sources = attempt === 0 ? [url] : [];
  if (fallbackUrl) sources.push(fallbackUrl);
  sources.push(fresh(fallbackUrl ?? url));
  return sources;
}
