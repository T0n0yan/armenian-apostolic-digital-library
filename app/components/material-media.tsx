import { AlertCircle, Expand, FileText, Headphones, ImageIcon, LoaderCircle, RotateCw, Video } from "lucide-react";
import { memo, useCallback, useRef, useState, type SyntheticEvent } from "react";

import type { MaterialMedia } from "../data/material-detail.server";
import { isRetryableMediaError, mediaPlaybackLabel, mediaPlaybackStateForEvent, type MediaPlaybackState } from "../utils/media-playback";

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

function PlaybackStatus({ state, onRetry }: { state: MediaPlaybackState; onRetry: () => void }) {
  const busy = state === "initial" || state === "metadata" || state === "buffering" || state === "seeking";
  const failed = state.startsWith("error");
  return (
    <div
      className="flex min-h-10 items-center justify-between gap-3 border-t border-white/10 bg-[rgb(10_7_12/88%)] px-3 py-2 text-[11px] text-white/78"
      data-media-state={state}
      aria-busy={busy}
    >
      <span className="inline-flex min-w-0 items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
        {busy ? <LoaderCircle className="shrink-0 motion-safe:animate-spin" aria-hidden="true" size={14} /> : failed ? <AlertCircle className="shrink-0 text-gold" aria-hidden="true" size={14} /> : null}
        <span>{mediaPlaybackLabel(state)}</span>
      </span>
      {isRetryableMediaError(state) ? (
        <button className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-white/15 bg-white/8 px-3 font-bold text-white" type="button" onClick={onRetry}>
          <RotateCw aria-hidden="true" size={14} /> Կրկին փորձել
        </button>
      ) : null}
    </div>
  );
}

function StreamingMedia({ asset, kind, ratio }: { asset: MaterialMedia; kind: "audio" | "video"; ratio?: string }) {
  const elementRef = useRef<HTMLMediaElement | null>(null);
  const [state, setState] = useState<MediaPlaybackState>("initial");
  const ref = useCallback((element: HTMLMediaElement | null) => { elementRef.current = element; }, []);
  const updateFromCanPlay = (event: SyntheticEvent<HTMLMediaElement>) => {
    const paused = event.currentTarget.paused;
    setState((current) => mediaPlaybackStateForEvent(current, "can-play", { paused }));
  };
  const retry = () => {
    const element = elementRef.current;
    if (!element) return;
    setState((current) => mediaPlaybackStateForEvent(current, "retry"));
    element.load();
  };
  const common = {
    src: asset.url ?? undefined,
    controls: true,
    preload: "metadata" as const,
    onLoadStart: () => setState((current) => mediaPlaybackStateForEvent(current, "load-start")),
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      const paused = event.currentTarget.paused;
      setState((current) => mediaPlaybackStateForEvent(current, "metadata-ready", { paused }));
    },
    onCanPlay: updateFromCanPlay,
    onWaiting: () => setState((current) => mediaPlaybackStateForEvent(current, "waiting")),
    onStalled: () => setState((current) => mediaPlaybackStateForEvent(current, "stalled")),
    onSeeking: () => setState((current) => mediaPlaybackStateForEvent(current, "seeking")),
    onSeeked: (event: SyntheticEvent<HTMLMediaElement>) => {
      const paused = event.currentTarget.paused;
      setState((current) => mediaPlaybackStateForEvent(current, "seeked", { paused }));
    },
    onPlaying: () => setState((current) => mediaPlaybackStateForEvent(current, "playing")),
    onPause: (event: SyntheticEvent<HTMLMediaElement>) => {
      const seeking = event.currentTarget.seeking;
      const hasCurrentData = event.currentTarget.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      setState((current) => mediaPlaybackStateForEvent(current, "pause", {
        seeking,
        hasCurrentData,
      }));
    },
    onError: (event: SyntheticEvent<HTMLMediaElement>) => {
      const errorCode = event.currentTarget.error?.code ?? null;
      setState((current) => mediaPlaybackStateForEvent(current, "error", { errorCode }));
    },
  };

  return (
    <div className={kind === "video" ? "overflow-hidden rounded-[18px] border border-glass-border bg-[#100c10] shadow-card" : "grid min-w-0 gap-2.5"}>
      {kind === "video" ? (
        <video
          {...common}
          ref={ref}
          className="block max-h-[74svh] w-full object-contain"
          playsInline
          poster={asset.thumbnailUrl ?? undefined}
          style={{ aspectRatio: ratio }}
          aria-label={asset.altText || "Telegram հրապարակման տեսանյութ"}
        >
          Բրաուզերդ չի աջակցում տեսանյութը։
        </video>
      ) : (
        <audio
          {...common}
          ref={ref}
          className="w-full"
          aria-label={asset.altText || (asset.kind === "voice" ? "Telegram ձայնային հաղորդագրություն" : "Telegram հրապարակման աուդիո")}
        />
      )}
      <PlaybackStatus state={state} onRetry={retry} />
    </div>
  );
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

export function MaterialMediaItem({ asset, priority = false }: { asset: MaterialMedia; priority?: boolean }) {
  if (!asset.url) return <PendingMedia asset={asset} />;
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16 / 10";

  if (asset.kind === "photo") {
    return <PhotoMedia asset={asset} priority={priority} />;
  }

  if (asset.kind === "video" || asset.kind === "animation") {
    return <StreamingMedia asset={asset} kind="video" ratio={ratio} />;
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
          <StreamingMedia asset={asset} kind="audio" />
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
        {media.map((asset, index) => <div className="min-w-0 snap-center" key={asset.id}><MaterialMediaItem asset={asset} priority={index === 0} /></div>)}
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
