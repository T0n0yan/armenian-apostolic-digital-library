import { AlertCircle, Expand, FileText, Headphones, ImageIcon, RotateCw, Video } from "lucide-react";
import { memo, useState } from "react";

import type { MaterialMedia } from "../data/material-detail.server";

function durationLabel(seconds: number | null) {
  if (!seconds || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function Waveform({ encoded }: { encoded: string }) {
  let values: number[] = [];
  try {
    const binary = atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/"));
    values = Array.from(binary, (character) => character.charCodeAt(0)).slice(0, 48);
  } catch { /* Invalid Telegram waveform metadata is ignored safely. */ }
  if (values.length === 0) return null;
  return <span className="flex h-7 items-center gap-px overflow-hidden" aria-hidden="true">{values.map((value, index) => <span className="w-1 shrink-0 rounded-full bg-gold/55" style={{ height: `${Math.max(3, Math.round(value / 255 * 26))}px` }} key={`${index}-${value}`} />)}</span>;
}

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

function PhotoMedia({ asset, priority }: { asset: MaterialMedia; priority: boolean }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = showOriginal || !asset.thumbnailUrl ? asset.url : asset.thumbnailUrl;
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16 / 10";

  if (!source) return <PendingMedia asset={asset} />;
  if (failed) {
    return (
      <div className="grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-glass-border bg-subtle p-6 text-center text-muted">
        <span className="grid justify-items-center gap-3">
          <AlertCircle aria-hidden="true" className="text-gold" size={28} strokeWidth={1.6} />
          <span className="text-[12px]">Նկարը չբեռնվեց, սակայն մյուս մեդիան շարունակում է աշխատել։</span>
          <button className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[12px] border border-glass-border bg-glass px-3 text-[12px] font-bold text-gold-bright" type="button" onClick={() => setFailed(false)}>
            <RotateCw aria-hidden="true" size={15} /> Կրկին փորձել
          </button>
        </span>
      </div>
    );
  }

  const image = (
    <img
      className="block h-auto max-h-[74svh] w-full object-contain"
      src={source}
      sizes="(min-width: 960px) 430px, 92vw"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      width={asset.width ?? 1280}
      height={asset.height ?? 800}
      style={{ aspectRatio: ratio }}
      alt={asset.altText || "Telegram հրապարակման նկար"}
      onError={() => setFailed(true)}
    />
  );

  return (
    <figure className="relative m-0 overflow-hidden rounded-[18px] border border-glass-border bg-[rgb(18_8_22/8%)] shadow-card">
      {!showOriginal && asset.thumbnailUrl && asset.url ? (
        <button className="group relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-inherit" type="button" onClick={() => setShowOriginal(true)} aria-label="Բեռնել նկարի ամբողջական տարբերակը">
          {image}
          <span className="absolute right-3 bottom-3 inline-flex min-h-9 items-center gap-2 rounded-[11px] border border-white/20 bg-[rgb(17_8_22/72%)] px-3 text-[11px] font-bold text-white backdrop-blur-md transition-transform group-hover:-translate-y-0.5">
            <Expand aria-hidden="true" size={14} /> Ամբողջ չափով
          </span>
        </button>
      ) : image}
    </figure>
  );
}

function MediaItem({ asset, priority = false }: { asset: MaterialMedia; priority?: boolean }) {
  if (!asset.url) return <PendingMedia asset={asset} />;
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16 / 10";

  if (asset.kind === "photo") {
    return <PhotoMedia asset={asset} priority={priority} />;
  }

  if (asset.kind === "video" || asset.kind === "animation") {
    return (
      <div className="overflow-hidden rounded-[18px] border border-glass-border bg-[#100c10] shadow-card">
        <video
          className="block max-h-[74svh] w-full object-contain"
          controls
          playsInline
          preload="metadata"
          poster={asset.thumbnailUrl ?? undefined}
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
      <div className="grid gap-3 rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_48%),var(--glass)] p-4 shadow-card min-[560px]:grid-cols-[96px_1fr]">
        {asset.thumbnailUrl ? <img className="aspect-square w-full max-w-24 rounded-[14px] object-cover" src={asset.thumbnailUrl} width={192} height={192} loading="lazy" decoding="async" alt={asset.title ? `${asset.title} շապիկ` : "Telegram աուդիոյի շապիկ"} /> : <span className="grid aspect-square w-20 place-items-center rounded-[14px] bg-subtle text-gold"><Headphones aria-hidden="true" size={30} /></span>}
        <div className="grid min-w-0 gap-2.5">
          <span className="flex min-w-0 items-start justify-between gap-3 text-[13px] font-bold text-gold-bright">
            <span className="min-w-0 truncate">{asset.title || asset.fileName || (asset.kind === "voice" ? "Ձայնային հաղորդագրություն" : "Աուդիո")}</span>
            {durationLabel(asset.duration) ? <span className="shrink-0 text-[11px] font-normal tabular-nums text-faint">{durationLabel(asset.duration)}</span> : null}
          </span>
          {asset.performer ? <span className="text-[11px] text-muted">{asset.performer}</span> : null}
          {asset.waveform ? <Waveform encoded={asset.waveform} /> : null}
          <audio className="w-full" controls preload="metadata" aria-label={asset.altText || (asset.kind === "voice" ? "Telegram ձայնային հաղորդագրություն" : "Telegram հրապարակման աուդիո")}>
            <source src={asset.url} type={asset.mimeType ?? undefined} />
          </audio>
        </div>
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
      <div className={media.length > 1 ? "grid snap-x snap-mandatory auto-cols-[minmax(84%,1fr)] grid-flow-col gap-2.5 overflow-x-auto pb-2 min-[720px]:snap-none min-[720px]:grid-flow-row min-[720px]:grid-cols-2 min-[720px]:overflow-visible min-[720px]:pb-0" : "grid gap-2.5"}>
        {media.map((asset, index) => <div className="min-w-0 snap-center" key={asset.id}><MediaItem asset={asset} priority={index === 0} /></div>)}
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
