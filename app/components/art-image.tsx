import type { ImgHTMLAttributes } from "react";

import { responsiveImage } from "../assets/responsive";

/**
 * Large artwork (880px on phones, full size on large screens). It appears whole once loaded, with
 * a soft shimmering oval in its place until then (.reveal-img, app.css).
 */
const DEFAULT_SIZES = "(max-width: 940px) 100vw, 940px";

/**
 * Loads an artwork the way <ArtImage> will (same srcset and sizes, so the browser picks the same
 * file) and resolves once it is decoded, or after `timeoutMs`. Page loaders await it so a new page
 * appears together with its picture instead of the picture popping in afterwards.
 */
export function preloadArt(src: string, timeoutMs = 1_500) {
  if (typeof window === "undefined") return Promise.resolve();
  const responsive = responsiveImage(src);
  const image = new Image();
  if (responsive) { image.sizes = DEFAULT_SIZES; image.srcset = responsive.srcSet; }
  image.src = src;
  return Promise.race([
    image.decode().catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

export function ArtImage({ src, className = "", sizes, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const responsive = responsiveImage(src);
  return (
    <span className="reveal-frame reveal-art relative block h-full w-full">
      <img
        className={`reveal-img ${className}`}
        src={src}
        srcSet={responsive?.srcSet}
        sizes={sizes ?? DEFAULT_SIZES}
        {...props}
      />
    </span>
  );
}
