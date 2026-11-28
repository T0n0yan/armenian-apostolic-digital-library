/**
 * Տեսանյութերի ավտոմատ սեղմում։ Աշխատում է GitHub Actions-ում՝ cloud-sync.yml-ի վերջում
 * (Worker-ը այն սկսում է նոր գրառումից 15 րոպե հետո և ամեն գիշեր), այնպես որ ցանկացած նոր
 * տեսանյութ՝ Telegram խմբից, կայքում ավելացված, սրբավայրի կամ օգնության, սեղմվում է ինքնուրույն։
 *
 * Կանոնները՝ shared/video-optimize.ts։ Ի՞նչ է անում ամեն ֆայլի հետ.
 * 1. Բերում է R2-ից, սեղմում ffmpeg-ով, ստուգում արդյունքը (տևողություն, ձայն, ձևաչափ)։
 * 2. Telegram-ի (v1/) և կայքի (attachments/) ֆայլերը փոխարինվում են նույն բանալիով (այդպես
 *    համաժամեցումը դրանք նորից չի բերում), բնօրինակը փոխարինումից առաջ պահվում է originals/-ում։
 *    D1-ում թարմանում է չափը և r2_etag-ը, որ հղման ?v=-ը փոխվի և քեշը հին ֆայլը չտա։
 * 3. Սրբավայրի և օգնության ֆայլերը ստանում են նոր բանալի («…-o2.mp4»), հղումը փոխվում է։
 * 4. R2-ում պահված ֆայլը նորից կարդացվում և համեմատվում է (sha256). միայն դրանից հետո է
 *    ջնջվում բնօրինակը (VIDEO_BACKUP_DAYS = 0, տիրոջ որոշում)։
 * 5. Կանոնները փոխվելիս (VIDEO_PROFILE) արդեն սեղմվածները նորից են սեղմվում բնօրինակից,
 *    քանի դեռ այն կա, և բնօրինակը ջնջվում է միայն դրանից հետո։
 * Ամեն քայլ գրանցվում է video_optimizations-ում, ուստի ընդհատված աշխատանքը շարունակվում է
 * հաջորդ անգամ, և ոչ մի ֆայլ երկու անգամ չի սեղմվում։
 *
 * Միջավայր՝ CLOUD_SYNC_ENV=production|staging, VIDEO_BUDGET_MINUTES (նոր ֆայլ չի սկսում դրանից հետո),
 * VIDEO_LIMIT (առավելագույնը այսքան ֆայլ մեկ աշխատանքում, փորձնական գործարկման համար),
 * CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID։ `--dry-run`՝ միայն ցույց է տալիս ցանկը։
 */
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  AUDIO_PROFILE, audioContentType, audioEncodeArgs, audioFacts, audioPlan as audioFilePlan, audioVerdict,
} from "../shared/audio-optimize";
import {
  MONO_DIFFERENCE_DB, VIDEO_BACKUP_DAYS, VIDEO_PROFILE, audioPlan, backupKeyOf, encodeArgs, isOptimizedKey,
  optimizeVerdict, optimizedKeyOf, parseMeanVolume, videoFacts, type VideoProbe,
} from "../shared/video-optimize";

const ENV = process.env.CLOUD_SYNC_ENV === "production" ? "production" : "staging";
const DATABASE = `armenian-apostolic-digital-library-${ENV}`;
const BUCKET = `armenian-apostolic-library-media-${ENV}`;
const BUDGET_MS = Math.max(1, Number(process.env.VIDEO_BUDGET_MINUTES) || 40) * 60_000;
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = Number(process.env.VIDEO_LIMIT) > 0 ? Number(process.env.VIDEO_LIMIT) : Infinity;
/** wrangler-ի պատասխանը, երբ ֆայլը R2-ում չկա։ */
const MISSING = /does not exist|NoSuchKey|not found|404/iu;
// wrangler-ը մեկ հարցմամբ ավելի մեծ ֆայլ չի վերբեռնում
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const startedAt = Date.now();

type Source = "telegram" | "attachment" | "place" | "help" | "church";
type Candidate = { source: Source; key: string; bytes: number | null; mime: string | null; ref: string };
type Row = { result_key: string; source_key: string; status: string; optimized_bytes: number; version: string; backup_key: string | null; profile: string; backup_deleted_at: string | null };

const log = (message: string) => console.log(`[${ENV}] ${message}`);
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} ՄԲ`;
const sql = (value: string | number | null) => value === null ? "NULL" : typeof value === "number" ? String(Math.round(value)) : `'${value.replaceAll("'", "''")}'`;

/** Ծրագիր՝ արդյունքով. ձախողման դեպքում՝ սխալ վերջին տողերով։ */
async function run(command: string, args: string[], options: { timeoutMs?: number; quiet?: boolean } = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { if (stdout.length < 4_000_000) stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8_000); });
  const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs) : null;
  const [code] = await once(child, "exit") as [number | null];
  if (timer) clearTimeout(timer);
  if (code !== 0) throw new Error(`${command} ${args.slice(0, 3).join(" ")} (${code}): ${(stderr || stdout).replace(/\u001b\[[0-9;]*m/gu, "").trim().slice(-600)}`);
  return { stdout, stderr };
}

async function wrangler(args: string[]) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return (await run(process.execPath, [join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), ...args])).stdout;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3_000 * attempt));
    }
  }
}

async function query<T>(command: string): Promise<T[]> {
  const output = await wrangler(["d1", "execute", DATABASE, "--remote", "--env", ENV, "--command", command, "--json"]);
  return (JSON.parse(output) as Array<{ results?: T[] }>).flatMap((item) => item.results ?? []);
}

async function execute(contents: string, work: string) {
  const file = join(work, `op-${Date.now()}.sql`);
  await writeFile(file, contents);
  await wrangler(["d1", "execute", DATABASE, "--remote", "--env", ENV, "--file", file, "--yes"]);
  await rm(file, { force: true });
}

const r2Get = (key: string, file: string) => wrangler(["r2", "object", "get", `${BUCKET}/${key}`, "--file", file, "--remote"]);
const r2Delete = (key: string) => wrangler(["r2", "object", "delete", `${BUCKET}/${key}`, "--remote"]);
function r2Put(key: string, file: string, contentType: string, immutable = false) {
  return wrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType,
    ...(immutable ? ["--cache-control", "public, max-age=31536000, immutable"] : []), "--remote"]);
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function probe(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { timeoutMs: 120_000 });
  return JSON.parse(stdout) as VideoProbe;
}

/** Ձախ և աջ ալիքները նույնն են՞ (խոսքի ձայնագրությունների մեծ մասը)։ */
async function nearlyMono(file: string, channels: number) {
  if (channels !== 2) return false;
  try {
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", file, "-vn", "-af", "pan=mono|c0=c0-c1,volumedetect", "-f", "null", "-"], { timeoutMs: 600_000 });
    const mean = parseMeanVolume(stderr);
    return mean !== null && mean <= MONO_DIFFERENCE_DB;
  } catch { return false; }
}

async function ensureFfmpeg() {
  try { await run("ffmpeg", ["-version"]); return; } catch { /* տեղադրենք */ }
  log("ffmpeg-ը տեղադրվում է…");
  await run("sudo", ["apt-get", "update", "-qq"]);
  await run("sudo", ["apt-get", "install", "-y", "-qq", "ffmpeg"]);
}

/** Բոլոր տեսանյութերը, որոնք դեռ սեղմված (կամ ստուգված) չեն։ */
async function findCandidates(done: Set<string>) {
  const list: Candidate[] = [];
  const telegram = await query<{ r2_key: string; size_bytes: number | null; mime_type: string | null }>(
    "SELECT r2_key, size_bytes, mime_type FROM library_media WHERE status = 'ready' AND kind = 'video' AND r2_key IS NOT NULL");
  for (const row of telegram) list.push({ source: "telegram", key: row.r2_key, bytes: row.size_bytes, mime: row.mime_type, ref: "" });
  const attachments = await query<{ r2_key: string; size_bytes: number | null; mime_type: string | null }>(
    "SELECT r2_key, size_bytes, mime_type FROM material_attachments WHERE kind = 'video'");
  for (const row of attachments) list.push({ source: "attachment", key: row.r2_key, bytes: row.size_bytes, mime: row.mime_type, ref: "" });
  const places = await query<{ id: string; video_url: string }>("SELECT id, video_url FROM places WHERE video_url LIKE 'places/%'");
  for (const row of places) list.push({ source: "place", key: row.video_url, bytes: null, mime: null, ref: row.id });
  const [help] = await query<{ value: string }>("SELECT value FROM site_settings WHERE key = 'help_videos'");
  try {
    const files = (JSON.parse(help?.value ?? "{}") as { files?: Record<string, { key?: unknown; size?: unknown }> }).files ?? {};
    for (const [id, file] of Object.entries(files)) {
      if (/^[a-z0-9-]{1,60}$/u.test(id) && typeof file?.key === "string" && file.key.startsWith("help/")) {
        list.push({ source: "help", key: file.key, bytes: typeof file.size === "number" ? file.size : null, mime: null, ref: id });
      }
    }
  } catch { /* վնասված JSON՝ բաց թողնել */ }
  // Փոքրերը՝ առաջինը, որ մեկ աշխատանքում հնարավորինս շատ ֆայլ պատրաստ լինի
  return list.filter((item) => !done.has(item.key) && !isOptimizedKey(item.key))
    .sort((a, b) => (a.bytes ?? 0) - (b.bytes ?? 0));
}

/** Հղումը փոխում է միայն եթե այն դեռ հին ֆայլին է (ադմինը կարող էր միջանկյալ ժամանակում նորը դնել)։ */
function swapReferenceSql(item: Candidate, newKey: string, bytes: number) {
  if (item.source === "place") {
    return `UPDATE places SET video_url = ${sql(newKey)} WHERE id = ${sql(item.ref)} AND video_url = ${sql(item.key)} RETURNING id;`;
  }
  const path = `$.files."${item.ref}"`;
  return `UPDATE site_settings SET value = json_set(value, '${path}.key', ${sql(newKey)}, '${path}.size', ${bytes}),
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'help_videos' AND json_extract(value, '${path}.key') = ${sql(item.key)} RETURNING key;`;
}

/** Telegram-ի/կայքի ֆայլի D1 տողը՝ նոր չափով, տեսակով և տարբերակով։ */
function finalizeInPlaceSql(item: Candidate, row: { bytes: number; version: string }, mime: string | null = "video/mp4") {
  // Պատարագի և շարականների ձայնագրությունները (church_audio). չափը փոխվում է, հղման ?v=-ն էլ հետը։
  if (item.source === "church") return `UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(item.key)};
UPDATE church_audio SET size = ${row.bytes}${mime ? `, content_type = ${sql(mime)}` : ""} WHERE object_key = ${sql(item.key)};`;
  const table = item.source === "telegram" ? "library_media" : "material_attachments";
  return `UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(item.key)};
UPDATE ${table} SET size_bytes = ${row.bytes},${mime ? ` mime_type = ${sql(mime)},` : ""} r2_etag = ${sql(row.version)} WHERE r2_key = ${sql(item.key)};`;
}

function recordSql(input: { result: string; source: string; status: string; originalBytes: number; optimizedBytes: number; version: string; backup: string | null; note: string; profile?: string }) {
  return `INSERT INTO video_optimizations (result_key, source_key, status, original_bytes, optimized_bytes, version, backup_key, note, profile)
VALUES (${sql(input.result)}, ${sql(input.source)}, ${sql(input.status)}, ${input.originalBytes}, ${input.optimizedBytes}, ${sql(input.version)}, ${sql(input.backup)}, ${sql(input.note)}, ${sql(input.profile ?? VIDEO_PROFILE)})
ON CONFLICT (result_key) DO UPDATE SET source_key = excluded.source_key, status = excluded.status, original_bytes = excluded.original_bytes,
optimized_bytes = excluded.optimized_bytes, version = excluded.version, backup_key = excluded.backup_key, note = excluded.note,
profile = excluded.profile, backup_deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`;
}

/** R2-ում պահված ֆայլը նույնն է, ինչ պատրաստեցինք (sha256). այլապես՝ սխալ, և բնօրինակը չի ջնջվում։ */
async function verifyStored(key: string, version: string, dir: string) {
  const check = join(dir, "stored-check");
  await r2Get(key, check);
  const stored = `o-${(await sha256(check)).slice(0, 16)}`;
  await rm(check, { force: true });
  if (stored !== version) throw new Error(`R2-ում պահվածը չի համընկնում (${key})`);
}

/** Սեղմում է մեկ ֆայլ ընթացիկ կանոններով և ստուգում։ */
async function encode(input: string, output: string) {
  const facts = videoFacts(await probe(input));
  if (!facts.hasVideo) return { facts, error: "no-video" } as const;
  const audio = audioPlan(facts, await nearlyMono(input, facts.audioChannels));
  // Ամենադանդաղ դեպքն էլ (1080p→720p, 2 միջուկ) մոտ իրական ժամանակի է. 4 անգամ պահուստ
  const timeoutMs = Math.max(15 * 60_000, facts.duration * 4_000);
  try {
    await run("ffmpeg", encodeArgs(input, output, audio), { timeoutMs });
  } catch (error) {
    return { facts, error: `encode-failed: ${(error as Error).message.slice(-120)}` } as const;
  }
  return { facts, error: null, bytes: (await stat(output)).size, result: videoFacts(await probe(output)) } as const;
}

/** Մեկ ֆայլ. true՝ եթե կայքում ինչ-որ բան փոխվեց։ */
async function optimizeOne(item: Candidate, work: string): Promise<boolean> {
  const dir = await mkdtemp(join(work, "v-"));
  try {
    const original = join(dir, "original");
    let originalBytes = 0;
    const keep = async (note: string, resultBytes = 0) => {
      await execute(recordSql({ result: item.key, source: item.key, status: "kept", originalBytes, optimizedBytes: resultBytes, version: "", backup: null, note }), work);
      log(`  թողնված է (${note})`);
      return false;
    };
    try {
      await r2Get(item.key, original);
    } catch (error) {
      // Ֆայլը R2-ում չկա (օր.՝ staging-ի մաքրումից հետո). նշում ենք, որ ամեն անգամ նորից չփորձվի
      if (MISSING.test((error as Error).message)) return keep("missing-file");
      throw error;
    }
    originalBytes = (await stat(original)).size;
    const output = join(dir, "optimized.mp4");
    let encoded;
    try { encoded = await encode(original, output); } catch { return keep("unreadable"); }
    if (encoded.error !== null) return keep(encoded.error);
    const resultBytes = encoded.bytes;
    const verdict = optimizeVerdict({ original: encoded.facts, originalBytes, result: encoded.result, resultBytes });
    log(`  ${mb(originalBytes)} → ${mb(resultBytes)} (${Math.round((1 - resultBytes / originalBytes) * 100)}%), ${verdict.note}`);
    if (!verdict.replace) return keep(verdict.note, resultBytes);
    if (resultBytes > MAX_UPLOAD_BYTES) return keep("too-large-to-upload", resultBytes);
    const version = `o-${(await sha256(output)).slice(0, 16)}`;

    if (item.source === "telegram" || item.source === "attachment") {
      // Նախ՝ պատճենը, հետո՝ «pending» տողը, հետո՝ փոխարինումը, վերջում՝ D1։ Ցանկացած տեղ ընդհատվելու
      // դեպքում finishPending-ը հաջորդ անգամ ավարտում կամ հետ է բերում։
      if (originalBytes > MAX_UPLOAD_BYTES) return keep("original-too-large-to-backup", resultBytes);
      const backup = backupKeyOf(item.key);
      await r2Put(backup, original, item.mime ?? "video/mp4");
      await execute(recordSql({ result: item.key, source: item.key, status: "pending", originalBytes, optimizedBytes: resultBytes, version, backup, note: verdict.note }), work);
      await r2Put(item.key, output, "video/mp4");
      await verifyStored(item.key, version, dir);
      await execute(finalizeInPlaceSql(item, { bytes: resultBytes, version }), work);
      return true;
    }

    const newKey = optimizedKeyOf(item.key);
    await r2Put(newKey, output, "video/mp4", true);
    await verifyStored(newKey, version, dir);
    // Հին ֆայլը մնում է որպես պատճեն և ջնջվում է 14 օր հետո
    await execute(recordSql({ result: newKey, source: item.key, status: "pending", originalBytes, optimizedBytes: resultBytes, version, backup: item.key, note: verdict.note }), work);
    const swapped = await query<{ id?: string; key?: string }>(swapReferenceSql(item, newKey, resultBytes));
    if (!swapped.length) {
      // Ադմինն արդեն փոխել էր տեսանյութը. մեր պատրաստածը պետք չէ
      await r2Delete(newKey);
      await execute(`DELETE FROM video_optimizations WHERE result_key = ${sql(newKey)};`, work);
      log("  հղումը միջանկյալ փոխվել էր, բաց թողնված");
      return false;
    }
    await execute(`UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(newKey)};`, work);
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const isAudioProfile = (profile: string) => profile.startsWith("a");
const isCurrentProfile = (profile: string) => profile === VIDEO_PROFILE || profile === AUDIO_PROFILE;

/** Ձայնագրությունները (Telegram-ից և կայքում ավելացված), որոնք դեռ սեղմված (կամ ստուգված) չեն։ */
async function findAudioCandidates(done: Set<string>) {
  const list: Candidate[] = [];
  for (const row of await query<{ r2_key: string; size_bytes: number | null; mime_type: string | null }>(
    "SELECT r2_key, size_bytes, mime_type FROM library_media WHERE status = 'ready' AND kind = 'audio' AND r2_key IS NOT NULL")) {
    list.push({ source: "telegram", key: row.r2_key, bytes: row.size_bytes, mime: row.mime_type, ref: "" });
  }
  for (const row of await query<{ r2_key: string; size_bytes: number | null; mime_type: string | null }>(
    "SELECT r2_key, size_bytes, mime_type FROM material_attachments WHERE kind = 'audio'")) {
    list.push({ source: "attachment", key: row.r2_key, bytes: row.size_bytes, mime: row.mime_type, ref: "" });
  }
  // Պատարագի և շարականների ձայնագրությունները (ադմինից վերբեռնված, R2 church/)։
  for (const row of await query<{ object_key: string; size: number; content_type: string }>("SELECT object_key, size, content_type FROM church_audio").catch(() => [])) {
    list.push({ source: "church", key: row.object_key, bytes: row.size, mime: row.content_type, ref: "" });
  }
  return list.filter((item) => !done.has(item.key)).sort((a, b) => (a.bytes ?? 0) - (b.bytes ?? 0));
}

/**
 * Մեկ ձայնագրություն. նույն ձևաչափով, նույն բանալիով (տեսակը չի փոխվում), բնօրինակը՝ originals/-ում
 * մինչև ստուգումը։ true՝ եթե կայքում ինչ-որ բան փոխվեց։
 */
async function optimizeAudio(item: Candidate, work: string): Promise<boolean> {
  const dir = await mkdtemp(join(work, "a-"));
  try {
    const original = join(dir, "original");
    let originalBytes = 0;
    const keep = async (note: string, resultBytes = 0) => {
      await execute(recordSql({ result: item.key, source: item.key, status: "kept", originalBytes, optimizedBytes: resultBytes, version: "", backup: null, note, profile: AUDIO_PROFILE }), work);
      log(`  թողնված է (${note})`);
      return false;
    };
    try {
      await r2Get(item.key, original);
    } catch (error) {
      if (MISSING.test((error as Error).message)) return keep("missing-file");
      throw error;
    }
    originalBytes = (await stat(original)).size;
    let facts;
    try { facts = audioFacts(await probe(original)); } catch { return keep("unreadable"); }
    const plan = audioFilePlan(facts, await nearlyMono(original, facts.channels));
    if ("skip" in plan) return keep(plan.skip);
    const output = join(dir, "optimized");
    try {
      await run("ffmpeg", audioEncodeArgs(original, output, plan), { timeoutMs: Math.max(10 * 60_000, facts.duration * 2_000) });
    } catch (error) {
      return keep(`encode-failed: ${(error as Error).message.slice(-120)}`);
    }
    const resultBytes = (await stat(output)).size;
    const verdict = audioVerdict({ original: facts, originalBytes, result: audioFacts(await probe(output)), resultBytes });
    log(`  ${mb(originalBytes)} → ${mb(resultBytes)} (${Math.round((1 - resultBytes / originalBytes) * 100)}%), ${plan.channels === 1 ? "մոնո" : "ստերեո"}, ${verdict.note}`);
    if (!verdict.replace) return keep(verdict.note, resultBytes);
    if (originalBytes > MAX_UPLOAD_BYTES) return keep("original-too-large-to-backup", resultBytes);
    const version = `o-${(await sha256(output)).slice(0, 16)}`;
    const contentType = audioContentType(plan.format);
    const backup = backupKeyOf(item.key);
    await r2Put(backup, original, item.mime ?? contentType);
    await execute(recordSql({ result: item.key, source: item.key, status: "pending", originalBytes, optimizedBytes: resultBytes, version, backup, note: verdict.note, profile: AUDIO_PROFILE }), work);
    await r2Put(item.key, output, contentType);
    await verifyStored(item.key, version, dir);
    await execute(finalizeInPlaceSql(item, { bytes: resultBytes, version }, item.source === "church" ? contentType : null), work);
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Որ սրբավայրին կամ օգնության տեսանյութին է պատկանում ֆայլը (հղումը փոխելու համար)։ */
async function referenceOf(key: string): Promise<{ source: "place" | "help"; ref: string } | null> {
  const [place] = await query<{ id: string }>(`SELECT id FROM places WHERE video_url = ${sql(key)}`);
  if (place) return { source: "place", ref: place.id };
  const [help] = await query<{ value: string }>("SELECT value FROM site_settings WHERE key = 'help_videos'");
  try {
    const files = (JSON.parse(help?.value ?? "{}") as { files?: Record<string, { key?: unknown }> }).files ?? {};
    const id = Object.entries(files).find(([, file]) => file?.key === key)?.[0];
    if (id) return { source: "help", ref: id };
  } catch { /* վնասված JSON */ }
  return null;
}

/**
 * Հին կանոններով (VIDEO_PROFILE-ից տարբեր) սեղմվածները՝ նորից, բնօրինակից։ Telegram-ի/կայքի
 * ֆայլը փոխարինվում է նույն բանալիով, իսկ D1-ը (չափ, r2_etag, տող) թարմանում է մեկ հարցմամբ.
 * ընդհատվելու դեպքում տողը մնում է հին կանոններով, և հաջորդ անգամ ամեն ինչ կրկնվում է նույն
 * բնօրինակից (երբեք՝ սեղմվածից)։ true՝ եթե կայքում ինչ-որ բան փոխվեց։
 */
async function reencodeOne(row: Row, work: string): Promise<boolean> {
  const dir = await mkdtemp(join(work, "r-"));
  const markProfile = (note: string) => execute(`UPDATE video_optimizations SET profile = ${sql(VIDEO_PROFILE)}, note = ${sql(note)},
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(row.result_key)};`, work);
  try {
    const original = join(dir, "original");
    try {
      await r2Get(row.backup_key!, original);
    } catch (error) {
      const message = (error as Error).message;
      if (!MISSING.test(message)) throw error;
      // Բնօրինակն այլևս չկա. մնում է ներկա սեղմվածը (սեղմվածից նորից չենք սեղմում)
      await markProfile("backup-missing");
      log("  բնօրինակը չկա, թողնված է ներկա տարբերակը");
      return false;
    }
    const originalBytes = (await stat(original)).size;
    const output = join(dir, "optimized.mp4");
    const encoded = await encode(original, output);
    if (encoded.error !== null) { await markProfile(`reencode-${encoded.error}`); log(`  թողնված է ներկան (${encoded.error})`); return false; }
    const verdict = optimizeVerdict({ original: encoded.facts, originalBytes, result: encoded.result, resultBytes: encoded.bytes });
    log(`  ${mb(row.optimized_bytes)} → ${mb(encoded.bytes)} (բնօրինակը՝ ${mb(originalBytes)}), ${verdict.note}`);
    // Նորը պետք է ճիշտ լինի և ներկայից իսկապես փոքր (առնվազն 3%), այլապես թողնում ենք ներկան
    if (!verdict.replace || encoded.bytes > row.optimized_bytes * 0.97 || encoded.bytes > MAX_UPLOAD_BYTES) {
      await markProfile(`reencode-kept: ${verdict.note}`);
      return false;
    }
    const version = `o-${(await sha256(output)).slice(0, 16)}`;

    if (row.result_key === row.source_key) {
      const table = row.result_key.startsWith("attachments/") ? "material_attachments" : "library_media";
      await r2Put(row.result_key, output, "video/mp4");
      await verifyStored(row.result_key, version, dir);
      await execute(`UPDATE video_optimizations SET optimized_bytes = ${encoded.bytes}, version = ${sql(version)}, profile = ${sql(VIDEO_PROFILE)},
note = ${sql(`reencoded: ${verdict.note}`)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(row.result_key)};
UPDATE ${table} SET size_bytes = ${encoded.bytes}, mime_type = 'video/mp4', r2_etag = ${sql(version)} WHERE r2_key = ${sql(row.result_key)};`, work);
      return true;
    }

    // Սրբավայր/օգնություն. նոր բանալի, հղումը՝ նորին, հին սեղմվածը ջնջվում է
    const owner = await referenceOf(row.result_key);
    if (!owner) { await markProfile("reencode-no-reference"); return false; }
    const newKey = optimizedKeyOf(row.backup_key!);
    if (newKey === row.result_key) { await markProfile("reencode-same-key"); return false; }
    await r2Put(newKey, output, "video/mp4", true);
    await verifyStored(newKey, version, dir);
    await execute(recordSql({ result: newKey, source: row.backup_key!, status: "pending", originalBytes, optimizedBytes: encoded.bytes, version, backup: row.backup_key, note: `reencoded: ${verdict.note}` }), work);
    const swapped = await query<{ id?: string; key?: string }>(swapReferenceSql({ source: owner.source, key: row.result_key, bytes: null, mime: null, ref: owner.ref }, newKey, encoded.bytes));
    if (!swapped.length) {
      await r2Delete(newKey);
      await execute(`DELETE FROM video_optimizations WHERE result_key = ${sql(newKey)};`, work);
      await markProfile("reencode-reference-changed");
      return false;
    }
    await execute(`UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(newKey)};
DELETE FROM video_optimizations WHERE result_key = ${sql(row.result_key)};`, work);
    await r2Delete(row.result_key).catch((error) => log(`  հին սեղմվածը չջնջվեց՝ ${(error as Error).message.slice(0, 120)}`));
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Նախորդ անգամ ընդհատված աշխատանքները. ավարտել, եթե ֆայլն արդեն փոխարինված է, այլապես՝ նորից սկսել։ */
async function finishPending(rows: Row[], work: string) {
  let changed = false;
  for (const row of rows.filter((item) => item.status === "pending")) {
    log(`Ընդհատված՝ ${row.result_key}`);
    if (row.result_key === row.source_key) {
      const file = join(work, "pending-check");
      let current: string | null = null;
      try { await r2Get(row.result_key, file); current = `o-${(await sha256(file)).slice(0, 16)}`; } catch { /* ֆայլ չկա */ }
      await rm(file, { force: true });
      if (current === row.version) {
        const source: Source = row.result_key.startsWith("attachments/") ? "attachment" : row.result_key.startsWith("church/") ? "church" : "telegram";
        // Ձայնագրության տեսակը չի փոխվում (MP3-ը մնում է MP3)
        await execute(finalizeInPlaceSql({ source, key: row.result_key, bytes: null, mime: null, ref: "" }, { bytes: row.optimized_bytes, version: row.version }, isAudioProfile(row.profile) ? null : "video/mp4"), work);
        changed = true;
      } else {
        // Փոխարինումը չէր կատարվել. բնօրինակը տեղում է, կսեղմվի նորից
        await execute(`DELETE FROM video_optimizations WHERE result_key = ${sql(row.result_key)};`, work);
      }
      continue;
    }
    // Սրբավայր/օգնություն. հղումը արդեն նոր ֆայլի՞ն է
    const place = await query<{ id: string }>(`SELECT id FROM places WHERE video_url = ${sql(row.result_key)}`);
    const help = await query<{ key: string }>(`SELECT key FROM site_settings WHERE key = 'help_videos' AND instr(value, ${sql(`"${row.result_key}"`)}) > 0`);
    if (place.length || help.length) {
      await execute(`UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(row.result_key)};`, work);
      changed = true;
    } else {
      await r2Delete(row.result_key).catch(() => undefined);
      await execute(`DELETE FROM video_optimizations WHERE result_key = ${sql(row.result_key)};`, work);
    }
  }
  return changed;
}

/**
 * Բնօրինակների պատճենները ջնջվում են (VIDEO_BACKUP_DAYS-ից հետո, հիմա՝ անմիջապես)։ Միայն ընթացիկ
 * կանոններով սեղմվածներինը. հին կանոններով սեղմվածի բնօրինակը պետք է նորից սեղմելու համար։
 */
async function deleteOldBackups(work: string) {
  const rows = await query<{ result_key: string; backup_key: string }>(
    `SELECT result_key, backup_key FROM video_optimizations WHERE status = 'optimized' AND backup_key IS NOT NULL
     AND profile IN (${sql(VIDEO_PROFILE)}, ${sql(AUDIO_PROFILE)}) AND backup_deleted_at IS NULL
     AND updated_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${VIDEO_BACKUP_DAYS} days')`);
  for (const row of rows) {
    // Ապահովության համար. երբեք չջնջել այն, ինչ հիմա տրվում է
    if (row.backup_key === row.result_key) continue;
    if (!DRY_RUN) {
      await r2Delete(row.backup_key).catch((error) => log(`  պատճենը չջնջվեց՝ ${(error as Error).message.slice(0, 120)}`));
      await execute(`UPDATE video_optimizations SET backup_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(row.result_key)};`, work);
    }
  }
  if (rows.length) log(`Ջնջված բնօրինակներ՝ ${rows.length}`);
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), "optimize-videos-"));
  try {
    const readRows = () => query<Row>("SELECT result_key, source_key, status, optimized_bytes, version, backup_key, profile, backup_deleted_at FROM video_optimizations");
    let changed = DRY_RUN ? false : await finishPending(await readRows(), work);
    await deleteOldBackups(work);
    let processed = 0;
    const outOfTime = () => Date.now() - startedAt > BUDGET_MS || processed >= LIMIT;

    // 1. Հին կանոններով սեղմվածները՝ նորից, բնօրինակից (մինչև բնօրինակների ջնջումը)
    const stale = (await readRows()).filter((row) => row.status === "optimized" && !isAudioProfile(row.profile) && row.profile !== VIDEO_PROFILE && row.backup_key && !row.backup_deleted_at)
      .sort((a, b) => a.optimized_bytes - b.optimized_bytes);
    log(`Նորից սեղմելու (${VIDEO_PROFILE})՝ ${stale.length}`);
    if (DRY_RUN) for (const row of stale) log(`  ${row.result_key} ${mb(row.optimized_bytes)} ← ${row.backup_key}`);
    if (stale.length && !DRY_RUN) await ensureFfmpeg();
    for (const row of DRY_RUN ? [] : stale) {
      if (outOfTime()) { log(`Ժամանակը/սահմանը սպառվեց. մնացածը՝ հաջորդ անգամ`); break; }
      processed += 1;
      log(`${processed}. նորից ${row.result_key}`);
      try {
        if (await reencodeOne(row, work)) changed = true;
      } catch (error) {
        log(`  սխալ՝ ${(error as Error).message.slice(0, 300)}`);
      }
    }

    // 2. Նոր տեսանյութեր և նախկինում թողնվածները (հին կանոններով «kept»-ը նորից է փորձվում)։
    // Կրկին կարդում ենք. «pending»-ը (dry-run-ում) նույնպես «արված» է, որ ոչինչ երկու անգամ չսեղմվի
    const done = new Set((await readRows()).filter((row) => !(row.status === "kept" && !isCurrentProfile(row.profile))).map((row) => row.result_key));
    const candidates = await findCandidates(done);
    const audios = await findAudioCandidates(done);
    log(`Սեղմելու տեսանյութեր՝ ${candidates.length}, ձայնագրություններ՝ ${audios.length}`);
    if (DRY_RUN) { for (const item of [...candidates, ...audios]) log(`  ${item.source} ${item.key} ${item.bytes ? mb(item.bytes) : ""}`); return; }
    if (candidates.length || audios.length) await ensureFfmpeg();
    for (const [index, item] of candidates.entries()) {
      if (outOfTime()) { log(`Ժամանակը/սահմանը սպառվեց. մնացածը՝ հաջորդ անգամ`); break; }
      processed += 1;
      log(`${index + 1}/${candidates.length} ${item.source} ${item.key}`);
      try {
        if (await optimizeOne(item, work)) changed = true;
      } catch (error) {
        // Ցանցի/R2-ի սխալ. ոչինչ չի գրանցվում, հաջորդ անգամ նորից կփորձվի
        log(`  սխալ՝ ${(error as Error).message.slice(0, 300)}`);
      }
    }
    // 3. Ձայնագրություններ (MP3/AAC), փոքրերից սկսած
    for (const [index, item] of audios.entries()) {
      if (outOfTime()) { log(`Ժամանակը/սահմանը սպառվեց. մնացածը՝ հաջորդ անգամ`); break; }
      processed += 1;
      log(`ձայն ${index + 1}/${audios.length} ${item.source} ${item.key}`);
      try {
        if (await optimizeAudio(item, work)) changed = true;
      } catch (error) {
        log(`  սխալ՝ ${(error as Error).message.slice(0, 300)}`);
      }
    }
    // 4. Ստուգված սեղմվածների բնօրինակները՝ ջնջել (VIDEO_BACKUP_DAYS = 0)
    await deleteOldBackups(work);
    if (changed) {
      // Էջերի քեշը թարմանում է, որ նոր ?v= հղումները անմիջապես երևան
      await execute(`INSERT INTO site_settings (key, value) VALUES ('cache_epoch', '${Date.now()}')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`, work);
    }
    const totals = await query<{ audio: number; files: number; before: number; after: number }>(
      "SELECT profile LIKE 'a%' AS audio, COUNT(*) files, COALESCE(SUM(original_bytes),0) before, COALESCE(SUM(optimized_bytes),0) after FROM video_optimizations WHERE status = 'optimized' GROUP BY profile LIKE 'a%'");
    for (const total of totals) log(`Ընդհանուր սեղմված ${total.audio ? "ձայնագրություններ" : "տեսանյութեր"}՝ ${total.files} ֆայլ, ${mb(total.before)} → ${mb(total.after)}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await main();
