export type MediaPlaybackState = "initial" | "metadata" | "buffering" | "seeking" | "playing" | "paused" | "error";
export type MediaPlaybackEvent = "load-start" | "metadata-ready" | "can-play" | "waiting" | "stalled" | "seeking" | "seeked" | "playing" | "pause" | "error" | "retry";

export function mediaPlaybackStateForEvent(
  current: MediaPlaybackState,
  event: MediaPlaybackEvent,
  media: { paused?: boolean; seeking?: boolean; hasCurrentData?: boolean } = {},
): MediaPlaybackState {
  if (event === "retry") return "initial";
  if (event === "load-start") return "metadata";
  if (event === "waiting" || event === "stalled") return "buffering";
  if (event === "seeking") return "seeking";
  if (event === "playing") return "playing";
  if (event === "error") return "error";
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
    case "error": return "Մեդիան չբեռնվեց։ Կարող եք կրկին փորձել։";
  }
}
