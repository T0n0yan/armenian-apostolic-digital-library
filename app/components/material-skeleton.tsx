import { memo } from "react";

export const MaterialListSkeleton = memo(function MaterialListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2.5" role="status" aria-label="Նյութերը բեռնվում են">
      {Array.from({ length: count }, (_, index) => (
        <div className="grid min-h-[122px] grid-cols-[78px_minmax(0,1fr)] gap-3 rounded-[18px] border border-glass-border bg-card-glass p-3 motion-safe:animate-pulse min-[560px]:grid-cols-[96px_minmax(0,1fr)]" key={index} aria-hidden="true">
          <span className="aspect-[4/3] w-full rounded-[12px] bg-[rgb(217_181_111/12%)]" />
          <span className="grid content-start gap-3">
            <span className="h-5 w-[34%] rounded-full bg-[rgb(217_181_111/14%)]" />
            <span className="h-4 w-[82%] rounded-full bg-[rgb(255_255_255/9%)]" />
            <span className="h-3 w-[68%] rounded-full bg-[rgb(255_255_255/6%)]" />
            <span className="h-3 w-[48%] rounded-full bg-[rgb(255_255_255/6%)]" />
          </span>
        </div>
      ))}
    </div>
  );
});
