import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import { responsiveImage } from "../assets/responsive";

/**
 * Large artwork: a tiny blurred preview shows at once and fades away when the real picture (880px
 * on phones, full size on large screens) has loaded. Keeps transparent edges clean.
 */
export function ArtImage({ src, className = "", sizes, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const responsive = responsiveImage(src);
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setLoaded(true); }, []);
  return (
    <span className="relative block">
      {responsive ? (
        <img className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-[10px] transition-opacity duration-700 ${loaded ? "opacity-0" : "opacity-90"}`} src={responsive.placeholder} alt="" aria-hidden="true" />
      ) : null}
      <img
        ref={ref}
        className={`${className} transition-opacity duration-500 ${loaded || !responsive ? "opacity-100" : "opacity-0"}`}
        src={src}
        srcSet={responsive?.srcSet}
        sizes={sizes ?? "(max-width: 940px) 100vw, 940px"}
        onLoad={() => setLoaded(true)}
        {...props}
      />
    </span>
  );
}
