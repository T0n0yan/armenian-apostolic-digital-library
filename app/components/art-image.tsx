import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import { responsiveImage } from "../assets/responsive";

/**
 * Large artwork (880px on phones, full size on large screens). Until it has loaded, a tiny blurred
 * preview shows in its place, then fades away.
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
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true); }, []);
  return (
    <span className="relative block h-full w-full">
      {responsive ? (
        <img className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-[10px] transition-opacity duration-700 ${loaded ? "opacity-0" : "opacity-90"}`} src={responsive.placeholder} alt="" aria-hidden="true" />
      ) : null}
      <img
        ref={ref}
        className={className}
        src={src}
        srcSet={responsive?.srcSet}
        sizes={sizes ?? DEFAULT_SIZES}
        onLoad={() => setLoaded(true)}
        {...props}
      />
    </span>
  );
}
