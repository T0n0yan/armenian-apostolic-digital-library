import assert from "node:assert/strict";
import test from "node:test";

import { audioEncodeArgs, audioFacts, audioPlan, audioVerdict, type AudioFacts } from "../shared/audio-optimize";

const facts = (over: Partial<AudioFacts> = {}): AudioFacts => ({ hasAudio: true, format: "mp3", channels: 2, bitRate: 320_000, duration: 60, ...over });

test("ձայնագրության տվյալներ՝ MP3, AAC (mp4-ում), մնացածը՝ անհայտ", () => {
  const mp3 = audioFacts({ streams: [{ codec_type: "audio", codec_name: "mp3", channels: 2, bit_rate: "320000" }, { codec_type: "video", codec_name: "png" }], format: { format_name: "mp3", duration: "60.18" } });
  assert.deepEqual([mp3.format, mp3.channels, mp3.bitRate, Math.round(mp3.duration)], ["mp3", 2, 320_000, 60]);
  assert.equal(audioFacts({ streams: [{ codec_type: "audio", codec_name: "aac" }], format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } }).format, "aac");
  assert.equal(audioFacts({ streams: [{ codec_type: "audio", codec_name: "opus" }], format: { format_name: "ogg" } }).format, null);
});

test("պլան. ձայնային հաղորդագրություն և արդեն փոքր ֆայլը չեն սեղմվում, խոսքը՝ մոնո", () => {
  assert.deepEqual(audioPlan(facts(), false), { format: "mp3", channels: 2 });
  assert.deepEqual(audioPlan(facts(), true), { format: "mp3", channels: 1 });
  assert.deepEqual(audioPlan(facts({ format: null }), false), { skip: "unsupported-format" });
  assert.deepEqual(audioPlan(facts({ bitRate: 128_000 }), false), { skip: "already-small" });
  assert.deepEqual(audioPlan(facts({ bitRate: 64_000, channels: 1 }), false), { skip: "already-small" });
  assert.deepEqual(audioPlan(facts({ hasAudio: false }), false), { skip: "no-audio" });
});

test("ffmpeg. MP3 VBR, նկարն ու պիտակները հանված, AAC՝ faststart", () => {
  const mp3 = audioEncodeArgs("in", "out", { format: "mp3", channels: 2 });
  for (const part of ["libmp3lame", "0:a:0", "-vn"]) assert.ok(mp3.includes(part), part);
  assert.equal(mp3[mp3.indexOf("-q:a") + 1], "4");
  assert.equal(mp3[mp3.indexOf("-map_metadata") + 1], "-1");
  assert.equal(audioEncodeArgs("in", "out", { format: "mp3", channels: 1 })[audioEncodeArgs("in", "out", { format: "mp3", channels: 1 }).indexOf("-q:a") + 1], "5");
  const aac = audioEncodeArgs("in", "out", { format: "aac", channels: 2 });
  assert.ok(aac.includes("+faststart") && aac.includes("96k"));
  assert.equal(aac.at(-1), "out");
});

test("փոխարինել միայն երբ նույն ձևաչափ, նույն տևողություն և ≥15% փոքր", () => {
  assert.deepEqual(audioVerdict({ original: facts(), originalBytes: 100, result: facts({ bitRate: 110_000 }), resultBytes: 35 }), { replace: true, note: "smaller" });
  assert.equal(audioVerdict({ original: facts(), originalBytes: 100, result: facts(), resultBytes: 90 }).note, "no-gain");
  assert.equal(audioVerdict({ original: facts(), originalBytes: 100, result: facts({ duration: 70 }), resultBytes: 30 }).note, "duration-mismatch");
  assert.equal(audioVerdict({ original: facts(), originalBytes: 100, result: facts({ format: "aac" }), resultBytes: 30 }).note, "result-invalid");
});
