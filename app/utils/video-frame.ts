import { useEffect, useRef, useState } from "react";

import { isNearlyBlackImage } from "./image-darkness";

const CACHE_PREFIX = "video-frame:v3:";
const CAPTURE_TIMEOUT_MS = 12_000;

// One capture at a time: each one streams part of a video, and phones on mobile data feel it.
let queue: Promise<unknown> = Promise.resolve();

function cached(url: string) {
  try { return localStorage.getItem(CACHE_PREFIX + url); } catch { return null; }
}

function remember(url: string, dataUrl: string) {
  try { localStorage.setItem(CACHE_PREFIX + url, dataUrl); } catch { /* Storage full or blocked: capture again next time. */ }
}

/**
 * Grabs a frame from inside a video (about a third of the way in, at most a minute), because the
 * first frame of an edited video is usually black from its fade-in. Returns a small JPEG data URL.
 */
function captureFrame(videoUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = duration > 0 ? Math.min(60, duration * 0.33) : 5;
    }, { once: true });
    video.addEventListener("seeked", () => {
      try {
        const width = 480;
        const height = Math.round(width * (video.videoHeight || 270) / (video.videoWidth || 480));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        finish(null);
      }
    }, { once: true });
    video.addEventListener("error", () => finish(null), { once: true });
    video.src = videoUrl;
  });
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Poster for a video: Telegram's thumbnail when it shows something, otherwise a frame captured
 * from inside the video (cached on the device). Starts only once `element` scrolls near view.
 */
export function useVideoPoster(videoUrl: string | null, thumbnailUrl: string | null) {
  const [poster, setPoster] = useState<string | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!videoUrl) return;
    const saved = cached(videoUrl);
    if (saved) { setPoster(saved); return; }
    let active = true;
    const run = async () => {
      if (thumbnailUrl) {
        const image = await loadImage(sameOriginMedia(thumbnailUrl));
        if (!active) return;
        if (image && !isNearlyBlackImage(image)) { setPoster(thumbnailUrl); return; }
      }
      queue = queue.then(async () => {
        if (!active) return;
        const frame = await captureFrame(sameOriginMedia(videoUrl));
        if (frame) remember(videoUrl, frame);
        if (active && frame) setPoster(frame);
      });
    };
    const element = elementRef.current;
    if (!element || !("IntersectionObserver" in window)) { void run(); return () => { active = false; }; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void run(); }
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [thumbnailUrl, videoUrl]);
  return { poster, ref: elementRef };
}
