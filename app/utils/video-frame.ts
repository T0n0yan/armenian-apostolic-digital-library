import { useEffect, useRef, useState } from "react";


const CACHE_PREFIX = "video-frame:v3:";
function cached(url: string) {
  try { return localStorage.getItem(CACHE_PREFIX + url); } catch { return null; }
}

const DIRECT_MEDIA = /^https:\/\/[^/]+\/v1\/(-?\d+)\/(\d+)\/[^/]+\/(\d+)\/(thumbnail\.jpg|original\.[a-z0-9]+)(?:\?v=([^&#]+))?$/u;

/**
 * The same file through the site's own /media route. The media address (R2) sends no CORS headers,
 * so the page can neither read a thumbnail's pixels nor draw a video frame from there.
 */
export function sameOriginMedia(url: string) {
  const match = DIRECT_MEDIA.exec(url);
  if (!match) return url;
  const [, chatId, messageId, index, file, version] = match;
  const query = [file === "thumbnail.jpg" ? "thumbnail=1" : "", version ? `v=${version}` : ""].filter(Boolean).join("&");
  return `/media/${encodeURIComponent(chatId)}/${messageId}/${index}${query ? `?${query}` : ""}`;
}

/** A video's own address from its thumbnail's (both forms of media address). */
export function videoFromThumbnail(thumbnailUrl: string) {
  return thumbnailUrl.replace(/\/thumbnail\.jpg(?=\?|$)/u, "/original.mp4").replace("?thumbnail=1&", "?").replace(/\?thumbnail=1$/u, "");
}

export function useVideoPoster(videoUrl: string | null, thumbnailUrl: string | null) {
  const [poster, setPoster] = useState<string | null>(thumbnailUrl);
  const elementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setPoster((videoUrl && cached(videoUrl)) || thumbnailUrl);
  }, [thumbnailUrl, videoUrl]);
  return { poster, ref: elementRef };
}
