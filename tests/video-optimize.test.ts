import assert from "node:assert/strict";
import test from "node:test";

import {
  audioPlan, backupKeyOf, encodeArgs, isOptimizedKey, optimizeVerdict, optimizedKeyOf, parseMeanVolume, videoFacts,
  type VideoFacts,
} from "../shared/video-optimize";

const telegramVideo = {
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "2613.26" },
  streams: [
    { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 424, height: 320 },
    { codec_type: "audio", codec_name: "aac", channels: 2, bit_rate: "125587" },
  ],
};

const facts = (patch: Partial<VideoFacts> = {}): VideoFacts => ({
  hasVideo: true, hasAudio: true, audioChannels: 2, audioBitRate: 125_000, duration: 300, browserSafe: true, ...patch,
});

test("ffprobe-ի տվյալներից՝ նվագարկվում է ամեն տեղ թե ոչ", () => {
  const telegram = videoFacts(telegramVideo);
  assert.equal(telegram.browserSafe, true);
  assert.equal(telegram.hasAudio, true);
  assert.equal(Math.round(telegram.duration), 2613);
  // iPhone-ի HEVC MOV-ը և WebM-ը՝ ոչ բոլոր սարքերում
  const hevc = videoFacts({ ...telegramVideo, streams: [{ codec_type: "video", codec_name: "hevc", pix_fmt: "yuv420p10le" }] });
  assert.equal(hevc.browserSafe, false);
  const webm = videoFacts({ format: { format_name: "matroska,webm", duration: "10" }, streams: [{ codec_type: "video", codec_name: "vp9" }] });
  assert.equal(webm.browserSafe, false);
  // Միայն շապիկի նկար (mjpeg)՝ տեսանյութ չէ
  assert.equal(videoFacts({ streams: [{ codec_type: "video", codec_name: "mjpeg" }] }).hasVideo, false);
});

test("ձայնը՝ մոնո 64k խոսքի համար, ստերեո 96k, բայց երբեք բնօրինակից բարձր", () => {
  assert.deepEqual(audioPlan(facts(), true), { channels: 1, bitRate: 64_000 });
  assert.deepEqual(audioPlan(facts(), false), { channels: 2, bitRate: 96_000 });
  assert.deepEqual(audioPlan(facts({ audioBitRate: 48_000 }), false), { channels: 2, bitRate: 48_000 });
  assert.deepEqual(audioPlan(facts({ audioChannels: 1 }), false), { channels: 1, bitRate: 64_000 });
  assert.deepEqual(audioPlan(facts({ hasAudio: false }), false), { channels: 0, bitRate: 0 });
});

test("ffmpeg-ի արգումենտները՝ H.264 High, faststart, առանց ձայնի՝ -an", () => {
  const args = encodeArgs("in", "out.mp4", { channels: 1, bitRate: 64_000 });
  for (const part of ["libx264", "high", "+faststart", "yuv420p"]) assert.ok(args.some((arg) => arg.includes(part)), part);
  assert.deepEqual(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 6), ["-c:a", "aac", "-ac", "1", "-b:a", "64k"]);
  assert.equal(args.at(-1), "out.mp4");
  assert.ok(encodeArgs("in", "out.mp4", { channels: 0, bitRate: 0 }).includes("-an"));
});

test("փոխարինել միայն երբ օգտակար է և արդյունքը ճիշտ է", () => {
  const result = facts({ audioChannels: 1 });
  assert.deepEqual(optimizeVerdict({ original: facts(), originalBytes: 100, result, resultBytes: 40 }), { replace: true, note: "smaller" });
  assert.deepEqual(optimizeVerdict({ original: facts(), originalBytes: 100, result, resultBytes: 90 }), { replace: false, note: "no-gain" });
  // Ոչ բոլոր սարքերում նվագարկվողը փոխարինվում է նույնիսկ առանց խնայողության
  assert.equal(optimizeVerdict({ original: facts({ browserSafe: false }), originalBytes: 100, result, resultBytes: 120 }).replace, true);
  assert.equal(optimizeVerdict({ original: facts(), originalBytes: 100, result: facts({ duration: 200 }), resultBytes: 10 }).note, "duration-mismatch");
  assert.equal(optimizeVerdict({ original: facts(), originalBytes: 100, result: facts({ hasAudio: false }), resultBytes: 10 }).note, "audio-lost");
  assert.equal(optimizeVerdict({ original: facts(), originalBytes: 100, result: facts({ browserSafe: false }), resultBytes: 10 }).replace, false);
});

test("բանալիներ և volumedetect-ի ելք", () => {
  assert.equal(optimizedKeyOf("places/haghpat/video-ab12.mov"), "places/haghpat/video-ab12-o.mp4");
  assert.equal(optimizedKeyOf("help/voronum-x1.mp4"), "help/voronum-x1-o.mp4");
  assert.equal(isOptimizedKey(optimizedKeyOf("help/a.webm")), true);
  assert.equal(backupKeyOf("v1/-100/277/abc/0/original.mp4"), "originals/v1/-100/277/abc/0/original.mp4");
  assert.equal(parseMeanVolume("[Parsed_volumedetect_1 @ 0x1] mean_volume: -67.5 dB"), -67.5);
  assert.equal(parseMeanVolume("mean_volume: -inf dB"), -Infinity);
  assert.equal(parseMeanVolume("nothing"), null);
});
