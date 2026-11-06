/**
 * Տեսանյութերի սեղմման կանոնները (մաքուր ֆունկցիաներ)։ Աշխատեցնողը՝ scripts/optimize-videos.ts։
 *
 * Նպատակը. ամեն սարքում նվագարկվող ֆայլ (MP4, H.264 High, AAC — հին iPhone-ներից ու Android-ներից
 * մինչև նոր նոութբուքեր), հնարավորինս փոքր, առանց տեսանելի որակի կորստի։
 * - պատկերը՝ CRF 26 (որակի վրա հիմնված, ոչ թե ֆիքսված բիթրեյթ), կարճ կողմը առավելագույնը 720,
 *   վայրկյանում առավելագույնը 30 կադր, երբեք չի մեծացվում
 * - ձայնը՝ AAC. եթե ձախ և աջ ալիքները նույնն են (խոսք)՝ մոնո 64k, այլապես ստերեո 96k
 * - «faststart»՝ նվագարկումը սկսվում է առանց ամբողջ ֆայլը բեռնելու
 */

export const VIDEO_SHORT_SIDE_MAX = 720;
export const VIDEO_CRF = 26;
/** Ֆայլը փոխարինվում է միայն եթե առնվազն այսքանով փոքրացել է (եթե բնօրինակն արդեն ամեն տեղ նվագարկվում է)։ */
export const VIDEO_MIN_SAVING = 0.15;
/** Բնօրինակի պատճենը պահվում է այսքան օր, հետո ջնջվում։ */
export const VIDEO_BACKUP_DAYS = 14;
/** Ձախ-աջ տարբերության միջին ձայնը (dB). սրանից ցածր՝ փաստացի մոնո։ */
export const MONO_DIFFERENCE_DB = -50;

export type ProbeStream = {
  codec_type?: string; codec_name?: string; profile?: string; pix_fmt?: string;
  width?: number; height?: number; channels?: number; bit_rate?: string;
};
export type VideoProbe = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string };
};

export type VideoFacts = {
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number;
  audioBitRate: number | null;
  duration: number;
  /** Արդեն նվագարկվում է ամեն տեղ (MP4 + H.264 8-bit 4:2:0 + AAC/MP3)։ */
  browserSafe: boolean;
};

export function videoFacts(probe: VideoProbe): VideoFacts {
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video" && stream.codec_name !== "mjpeg" && stream.codec_name !== "png");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const container = probe.format?.format_name ?? "";
  const bitRate = Number(audio?.bit_rate);
  return {
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    audioChannels: audio?.channels ?? 0,
    audioBitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : null,
    duration: Number(probe.format?.duration) || 0,
    browserSafe: container.split(",").includes("mp4")
      && video?.codec_name === "h264" && (video.pix_fmt === "yuv420p" || video.pix_fmt === "yuvj420p")
      && (!audio || audio.codec_name === "aac" || audio.codec_name === "mp3"),
  };
}

/** Աուդիոյի բիթրեյթը. երբեք ավելի բարձր, քան բնօրինակինը (կորածը հետ չի գա, միայն տեղ կզբաղեցնի)։ */
export function audioPlan(facts: VideoFacts, nearlyMono: boolean) {
  if (!facts.hasAudio) return { channels: 0, bitRate: 0 };
  const channels = facts.audioChannels === 1 || nearlyMono ? 1 : 2;
  const target = channels === 1 ? 64_000 : 96_000;
  const bitRate = facts.audioBitRate ? Math.max(32_000, Math.min(target, Math.round(facts.audioBitRate / 1000) * 1000)) : target;
  return { channels, bitRate };
}

/** ffmpeg-ի արգումենտները (առանց shell-ի, spawn-ով)։ */
export function encodeArgs(input: string, output: string, audio: { channels: number; bitRate: number }) {
  const side = VIDEO_SHORT_SIDE_MAX;
  // Կարճ կողմը ≤720, համամասնությունը պահված, չափերը զույգ (H.264-ի պահանջ), երբեք չի մեծացվում
  const scale = `scale=w='if(gt(iw,ih),-2,trunc(min(${side},iw)/2)*2)':h='if(gt(iw,ih),trunc(min(${side},ih)/2)*2,-2)'`;
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
    "-vf", `${scale},format=yuv420p`, "-fpsmax", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", String(VIDEO_CRF),
    "-profile:v", "high", "-level:v", "4.0", "-maxrate", "2500k", "-bufsize", "5000k",
    ...(audio.channels
      ? ["-c:a", "aac", "-ac", String(audio.channels), "-b:a", `${Math.round(audio.bitRate / 1000)}k`]
      : ["-an"]),
    "-movflags", "+faststart", output,
  ];
}

/** Փոխարինե՞լ, թե՞ թողնել բնօրինակը։ */
export function optimizeVerdict(input: { original: VideoFacts; originalBytes: number; result: VideoFacts; resultBytes: number }) {
  const { original, result } = input;
  if (!result.hasVideo || !result.browserSafe || input.resultBytes <= 0) return { replace: false, note: "result-invalid" } as const;
  if (Math.abs(original.duration - result.duration) > Math.max(1.5, original.duration * 0.01)) return { replace: false, note: "duration-mismatch" } as const;
  if (original.hasAudio && !result.hasAudio) return { replace: false, note: "audio-lost" } as const;
  // Եթե բնօրինակը ոչ բոլոր սարքերում է նվագարկվում (HEVC, WebM, MOV)՝ փոխարինում ենք ամեն դեպքում
  if (!original.browserSafe) return { replace: true, note: "compatibility" } as const;
  if (input.resultBytes > input.originalBytes * (1 - VIDEO_MIN_SAVING)) return { replace: false, note: "no-gain" } as const;
  return { replace: true, note: "smaller" } as const;
}

/** Ձախ-աջ տարբերության միջին ձայնը ffmpeg-ի volumedetect-ի ելքից։ */
export function parseMeanVolume(output: string) {
  const match = /mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/u.exec(output);
  if (!match) return null;
  return match[1] === "-inf" ? -Infinity : Number(match[1]);
}

/** Պահուստային պատճենի բանալին (Telegram-ի և կայքի ձայնագրությունների համար, որոնք փոխարինվում են նույն տեղում)։ */
export const backupKeyOf = (key: string) => `originals/${key}`;

/** Սրբավայրի և օգնության տեսանյութերի նոր բանալին. «places/x/video-ab.mov» → «places/x/video-ab-o.mp4»։ */
export function optimizedKeyOf(key: string) {
  const slash = key.lastIndexOf("/");
  const dot = key.lastIndexOf(".");
  const base = dot > slash ? key.slice(0, dot) : key;
  return `${base}-o.mp4`;
}

/** Արդյոք բանալին արդեն սեղմված ֆայլի է (կրկին չսեղմելու համար, եթե աղյուսակի տողը կորել է)։ */
export const isOptimizedKey = (key: string) => key.endsWith("-o.mp4");
