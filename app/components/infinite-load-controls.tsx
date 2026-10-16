import { LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { MaterialListSkeleton } from "./material-skeleton";

type InfiniteLoadControlsProps = {
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  onLoadMore: () => void;
};

export function InfiniteLoadControls({
  hasMore,
  isLoading,
  hasError,
  onLoadMore,
}: InfiniteLoadControlsProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading || hasError || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
    }, { rootMargin: "320px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasError, hasMore, isLoading]);

  return (
    <div
      className="grid min-h-16 place-items-center gap-2 pt-2"
      aria-busy={isLoading || undefined}
      aria-live="polite"
    >
      <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      {isLoading ? (
        <div className="w-full" role="status">
          <span className="sr-only">Բեռնվում են հաջորդ նյութերը</span>
          <MaterialListSkeleton count={2} />
        </div>
      ) : hasError ? (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-glass-border bg-subtle px-4 py-3 text-center">
          <p className="m-0 text-[12px] text-muted">Հաջորդ նյութերը չհաջողվեց բեռնել։</p>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgb(217_181_111/28%)] bg-[rgb(217_181_111/9%)] px-4 text-[12px] font-bold text-gold-bright"
            type="button"
            onClick={onLoadMore}
          >
            <RotateCw aria-hidden="true" size={15} /> Կրկին փորձել
          </button>
        </div>
      ) : hasMore ? (
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-border bg-subtle px-4 text-[12px] font-bold text-gold-bright active:scale-[.985]"
          type="button"
          onClick={onLoadMore}
        >
          <LoaderCircle aria-hidden="true" size={15} /> Բեռնել ավելին
        </button>
      ) : (
        <p className="m-0 text-[12px] text-faint" role="status">Այլ նյութ չկա</p>
      )}
    </div>
  );
}
