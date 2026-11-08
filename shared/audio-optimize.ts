/**
 * Ձայնագրությունների սեղմման կանոնները (մաքուր ֆունկցիաներ)։ Աշխատեցնողը՝ scripts/optimize-videos.ts։
 *
 * Telegram-ի ձայնագրությունները 320 kbps ստերեո MP3 էին (երաժշտական CD-ի որակ) և ներսում ունեին
 * նկար, որը ոչ ոք չի տեսնում։ Տիրոջ որոշում (2026-11-08)՝ առավելագույն սեղմում առանց լսելի կորստի.
 * - MP3-ը մնում է MP3 (նվագարկվում է ամեն տեղ, բանալին և տեսակը չեն փոխվում)՝ LAME VBR. ստերեո
 *   V4 (~110 kbps), իսկ եթե ձախ և աջ ալիքները նույնն են (խոսք)՝ մոնո V5 (~60 kbps)
 * - AAC-ը (m4a/mp4) մնում է AAC. ստերեո 96k, մոնո 64k, faststart
 * - ներսի նկարը և պիտակները հանվում են (վերնագիրը և կատարողը կայքը վերցնում է բազայից)
 * - ձայնային հաղորդագրությունները (voice, Opus) արդեն փոքր են, չեն սեղմվում
 * Սաղմոս 22-ի վրա՝ 2.5 ՄԲ → 0.8 ՄԲ (−69%)։
 */
import type { VideoProbe } from "./video-optimize";

export const AUDIO_PROFILE = "a1";
/** Փոխարինվում է միայն եթե առնվազն այսքանով փոքրացել է։ */
export const AUDIO_MIN_SAVING = 0.15;
/** Այսքանից ցածր bitrate-ով ֆայլը արդեն փոքր է (կորցնելու բան չկա)։ */
const ALREADY_SMALL = { mono: 72_000, stereo: 136_000 };

export type AudioFormat = "mp3" | "aac";
export type AudioFacts = { hasAudio: boolean; format: AudioFormat | null; channels: number; bitRate: number | null; duration: number };

export function audioFacts(probe: VideoProbe): AudioFacts {
  const audio = (probe.streams ?? []).find((stream) => stream.codec_type === "audio");
  const container = probe.format?.format_name ?? "";
  const format: AudioFormat | null = audio?.codec_name === "mp3" ? "mp3"
    : audio?.codec_name === "aac" && container.split(",").includes("mp4") ? "aac" : null;
  const streamRate = Number(audio?.bit_rate);
  const formatRate = Number(probe.format?.bit_rate);
  const bitRate = Number.isFinite(streamRate) && streamRate > 0 ? streamRate : Number.isFinite(formatRate) && formatRate > 0 ? formatRate : null;
  return { hasAudio: Boolean(audio), format, channels: audio?.channels ?? 0, bitRate, duration: Number(probe.format?.duration) || 0 };
}

/** Ինչ անել ֆայլի հետ. null՝ թողնել (անհայտ ձևաչափ կամ արդեն փոքր է)։ */
export function audioPlan(facts: AudioFacts, nearlyMono: boolean): { format: AudioFormat; channels: 1 | 2 } | { skip: string } {
  if (!facts.hasAudio) return { skip: "no-audio" };
  if (!facts.format) return { skip: "unsupported-format" };
  const channels = facts.channels === 1 || nearlyMono ? 1 : 2;
  if (facts.bitRate !== null && facts.bitRate <= (channels === 1 ? ALREADY_SMALL.mono : ALREADY_SMALL.stereo)) return { skip: "already-small" };
  return { format: facts.format, channels };
}

/** ffmpeg-ի արգումենտները (spawn-ով, առանց shell-ի)։ */
export function audioEncodeArgs(input: string, output: string, plan: { format: AudioFormat; channels: 1 | 2 }) {
  const codec = plan.format === "mp3"
    ? ["-c:a", "libmp3lame", "-q:a", plan.channels === 1 ? "5" : "4", "-f", "mp3"]
    : ["-c:a", "aac", "-b:a", plan.channels === 1 ? "64k" : "96k", "-movflags", "+faststart", "-f", "mp4"];
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
    "-map", "0:a:0", "-vn", "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
    "-ac", String(plan.channels), ...codec, output,
  ];
}

/** Փոխարինե՞լ. նույն ձևաչափ, նույն տևողություն, իսկապես փոքր։ */
export function audioVerdict(input: { original: AudioFacts; originalBytes: number; result: AudioFacts; resultBytes: number }) {
  const { original, result } = input;
  if (!result.hasAudio || result.format !== original.format || input.resultBytes <= 0) return { replace: false, note: "result-invalid" } as const;
  if (Math.abs(original.duration - result.duration) > Math.max(1, original.duration * 0.01)) return { replace: false, note: "duration-mismatch" } as const;
  if (input.resultBytes > input.originalBytes * (1 - AUDIO_MIN_SAVING)) return { replace: false, note: "no-gain" } as const;
  return { replace: true, note: "smaller" } as const;
}

/** Ֆայլի տեսակը R2-ում (փոխարինելիս նույնն է մնում)։ */
export const audioContentType = (format: AudioFormat) => format === "mp3" ? "audio/mpeg" : "audio/mp4";
