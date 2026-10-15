import { AlertCircle, FileText, Headphones, ImageIcon, Video } from "lucide-react";
import { memo } from "react";

import type { MaterialMedia } from "../data/material-detail.server";

function PendingMedia({ asset }: { asset: MaterialMedia }) {
  const Icon = asset.kind === "video" || asset.kind === "animation"
    ? Video
    : asset.kind === "audio" || asset.kind === "voice"
      ? Headphones
      : asset.kind === "document"
        ? FileText
        : ImageIcon;
  const message = asset.status === "failed" || asset.status === "missing"
      ? "Մեդիան առայժմ հասանելի չէ։"
      : "Մեդիան բեռնվում է Telegram-ից…";
  return (
    <div className="grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-glass-border bg-subtle p-6 text-center text-muted">
      <span className="grid justify-items-center gap-3">
        <Icon aria-hidden="true" className="text-gold" size={30} strokeWidth={1.5} />
        <span className="max-w-[280px] text-[12px] leading-[1.6]">{message}</span>
      </span>
    </div>
  );
}

function MediaItem({ asset, priority = false }: { asset: MaterialMedia; priority?: boolean }) {
  if (!asset.url) return <PendingMedia asset={asset} />;
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16 / 10";

  if (asset.kind === "photo") {
    return (
      <figure className="m-0 overflow-hidden rounded-[18px] border border-glass-border bg-[rgb(18_8_22/8%)] shadow-card">
        <img
          className="block h-auto max-h-[74svh] w-full object-contain"
          src={asset.url}
          sizes="(min-width: 960px) 860px, 100vw"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          width={asset.width ?? 1280}
          height={asset.height ?? 800}
          style={{ aspectRatio: ratio }}
          alt={asset.altText || "Telegram հրապարակման նկար"}
        />
      </figure>
    );
  }

  if (asset.kind === "video" || asset.kind === "animation") {
    return (
      <div className="overflow-hidden rounded-[18px] border border-glass-border bg-[#100c10] shadow-card">
        <video
          className="block max-h-[74svh] w-full object-contain"
          controls
          playsInline
          preload="metadata"
          style={{ aspectRatio: ratio }}
          aria-label={asset.altText || "Telegram հրապարակման տեսանյութ"}
        >
          <source src={asset.url} type={asset.mimeType ?? undefined} />
          Բրաուզերդ չի աջակցում տեսանյութը։
        </video>
      </div>
    );
  }

  if (asset.kind === "audio" || asset.kind === "voice") {
    return (
      <div className="grid gap-3 rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_48%),var(--glass)] p-4 shadow-card">
        <span className="flex items-center gap-2 text-[13px] font-bold text-gold-bright">
          <Headphones aria-hidden="true" size={18} /> {asset.fileName || "Աուդիո"}
        </span>
        <audio className="w-full" controls preload="metadata" aria-label={asset.altText || "Telegram հրապարակման աուդիո"}>
          <source src={asset.url} type={asset.mimeType ?? undefined} />
        </audio>
      </div>
    );
  }

  return (
    <a className="flex min-h-14 items-center gap-3 rounded-[16px] border border-glass-border bg-subtle px-4 text-[13px] font-bold text-gold-bright no-underline" href={asset.url} download={asset.fileName ?? undefined}>
      <FileText aria-hidden="true" size={20} />
      <span>{asset.fileName || "Բեռնել ֆայլը"}</span>
    </a>
  );
}

export const MaterialMediaGallery = memo(function MaterialMediaGallery({ media }: { media: MaterialMedia[] }) {
  if (media.length === 0) return null;
  const hasUnavailable = media.some((asset) => !asset.url);
  return (
    <section className="grid gap-2.5" aria-label="Հրապարակման մեդիա">
      <div className={media.length > 1 ? "grid gap-2.5 min-[720px]:grid-cols-2" : "grid gap-2.5"}>
        {media.map((asset, index) => <MediaItem key={asset.id} asset={asset} priority={index === 0} />)}
      </div>
      {hasUnavailable ? (
        <p className="m-0 flex items-start gap-2 rounded-[12px] border border-[rgb(217_181_111/18%)] bg-[rgb(217_181_111/7%)] px-3 py-2.5 text-[11px] leading-[1.55] text-muted">
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-gold" size={15} />
          Մեդիայի մի մասը Telegram-ից առայժմ հասանելի չէ։ Ամբողջական նյութը կարող ես բացել Telegram-ում։
        </p>
      ) : null}
    </section>
  );
});
