/**
 * Տեսանյութերի ավտոմատ սեղմում։ Աշխատում է GitHub Actions-ում՝ cloud-sync.yml-ի վերջում
 * (Worker-ը այն սկսում է նոր գրառումից 15 րոպե հետո և ամեն գիշեր), այնպես որ ցանկացած նոր
 * տեսանյութ՝ Telegram խմբից, կայքում ավելացված, սրբավայրի կամ օգնության, սեղմվում է ինքնուրույն։
 *
 * Կանոնները՝ shared/video-optimize.ts։ Ի՞նչ է անում ամեն ֆայլի հետ.
 * 1. Բերում է R2-ից, սեղմում ffmpeg-ով, ստուգում արդյունքը (տևողություն, ձայն, ձևաչափ)։
 * 2. Telegram-ի (v1/) և կայքի (attachments/) ֆայլերը փոխարինվում են նույն բանալիով (այդպես
 *    համաժամեցումը դրանք նորից չի բերում), բնօրինակը պահվում է originals/-ում 14 օր։
 *    D1-ում թարմանում է չափը և r2_etag-ը, որ հղման ?v=-ը փոխվի և քեշը հին ֆայլը չտա։
 * 3. Սրբավայրի և օգնության ֆայլերը ստանում են նոր բանալի («…-o.mp4»), հղումը փոխվում է,
 *    հինը ջնջվում է 14 օր հետո։
 * Ամեն քայլ գրանցվում է video_optimizations-ում, ուստի ընդհատված աշխատանքը շարունակվում է
 * հաջորդ անգամ, և ոչ մի ֆայլ երկու անգամ չի սեղմվում։
 *
 * Միջավայր՝ CLOUD_SYNC_ENV=production|staging, VIDEO_BUDGET_MINUTES (նոր ֆայլ չի սկսում դրանից հետո),
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
  MONO_DIFFERENCE_DB, VIDEO_BACKUP_DAYS, audioPlan, backupKeyOf, encodeArgs, isOptimizedKey,
  optimizeVerdict, optimizedKeyOf, parseMeanVolume, videoFacts, type VideoProbe,
} from "../shared/video-optimize";

const ENV = process.env.CLOUD_SYNC_ENV === "production" ? "production" : "staging";
const DATABASE = `armenian-apostolic-digital-library-${ENV}`;
const BUCKET = `armenian-apostolic-library-media-${ENV}`;
const BUDGET_MS = Math.max(1, Number(process.env.VIDEO_BUDGET_MINUTES) || 40) * 60_000;
const DRY_RUN = process.argv.includes("--dry-run");
// wrangler-ը մեկ հարցմամբ ավելի մեծ ֆայլ չի վերբեռնում
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const startedAt = Date.now();

type Source = "telegram" | "attachment" | "place" | "help";
type Candidate = { source: Source; key: string; bytes: number | null; mime: string | null; ref: string };
type Row = { result_key: string; source_key: string; status: string; optimized_bytes: number; version: string; backup_key: string | null };

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
function finalizeInPlaceSql(item: Candidate, row: { bytes: number; version: string }) {
  const table = item.source === "telegram" ? "library_media" : "material_attachments";
  return `UPDATE video_optimizations SET status = 'optimized', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(item.key)};
UPDATE ${table} SET size_bytes = ${row.bytes}, mime_type = 'video/mp4', r2_etag = ${sql(row.version)} WHERE r2_key = ${sql(item.key)};`;
}

function recordSql(input: { result: string; source: string; status: string; originalBytes: number; optimizedBytes: number; version: string; backup: string | null; note: string }) {
  return `INSERT INTO video_optimizations (result_key, source_key, status, original_bytes, optimized_bytes, version, backup_key, note)
VALUES (${sql(input.result)}, ${sql(input.source)}, ${sql(input.status)}, ${input.originalBytes}, ${input.optimizedBytes}, ${sql(input.version)}, ${sql(input.backup)}, ${sql(input.note)})
ON CONFLICT (result_key) DO UPDATE SET source_key = excluded.source_key, status = excluded.status, original_bytes = excluded.original_bytes,
optimized_bytes = excluded.optimized_bytes, version = excluded.version, backup_key = excluded.backup_key, note = excluded.note,
updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`;
}

/** Մեկ ֆայլ. true՝ եթե կայքում ինչ-որ բան փոխվեց։ */
async function optimizeOne(item: Candidate, work: string): Promise<boolean> {
  const dir = await mkdtemp(join(work, "v-"));
  try {
    const original = join(dir, "original");
    await r2Get(item.key, original);
    const originalBytes = (await stat(original)).size;
    const keep = async (note: string, resultBytes = 0) => {
      await execute(recordSql({ result: item.key, source: item.key, status: "kept", originalBytes, optimizedBytes: resultBytes, version: "", backup: null, note }), work);
      log(`  թողնված է (${note})`);
      return false;
    };
    let facts;
    try { facts = videoFacts(await probe(original)); } catch { return keep("unreadable"); }
    if (!facts.hasVideo) return keep("no-video");

    const output = join(dir, "optimized.mp4");
    const audio = audioPlan(facts, await nearlyMono(original, facts.audioChannels));
    // Ամենադանդաղ դեպքն էլ (1080p→720p, 2 միջուկ) մոտ իրական ժամանակի է. 4 անգամ պահուստ
    const timeoutMs = Math.max(15 * 60_000, facts.duration * 4_000);
    try {
      await run("ffmpeg", encodeArgs(original, output, audio), { timeoutMs });
    } catch (error) {
      return keep(`encode-failed: ${(error as Error).message.slice(-120)}`);
    }
    const resultBytes = (await stat(output)).size;
    const verdict = optimizeVerdict({ original: facts, originalBytes, result: videoFacts(await probe(output)), resultBytes });
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
      await execute(finalizeInPlaceSql(item, { bytes: resultBytes, version }), work);
      return true;
    }

    const newKey = optimizedKeyOf(item.key);
    await r2Put(newKey, output, "video/mp4", true);
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
        const source: Source = row.result_key.startsWith("attachments/") ? "attachment" : "telegram";
        await execute(finalizeInPlaceSql({ source, key: row.result_key, bytes: null, mime: null, ref: "" }, { bytes: row.optimized_bytes, version: row.version }), work);
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

/** 14 օրից հին պատճենները ջնջվում են։ */
async function deleteOldBackups(work: string) {
  const rows = await query<{ result_key: string; backup_key: string }>(
    `SELECT result_key, backup_key FROM video_optimizations WHERE status = 'optimized' AND backup_key IS NOT NULL
     AND backup_deleted_at IS NULL AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${VIDEO_BACKUP_DAYS} days')`);
  for (const row of rows) {
    // Ապահովության համար. երբեք չջնջել այն, ինչ հիմա տրվում է
    if (row.backup_key === row.result_key) continue;
    if (!DRY_RUN) {
      await r2Delete(row.backup_key).catch((error) => log(`  պատճենը չջնջվեց՝ ${(error as Error).message.slice(0, 120)}`));
      await execute(`UPDATE video_optimizations SET backup_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE result_key = ${sql(row.result_key)};`, work);
    }
  }
  if (rows.length) log(`Ջնջված հին պատճեններ՝ ${rows.length}`);
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), "optimize-videos-"));
  try {
    const readRows = () => query<Row>("SELECT result_key, source_key, status, optimized_bytes, version, backup_key FROM video_optimizations");
    let changed = DRY_RUN ? false : await finishPending(await readRows(), work);
    await deleteOldBackups(work);
    // Կրկին կարդում ենք. finishPending-ը կարող էր տողեր ավարտել կամ ջնջել։ «pending»-ը (dry-run-ում)
    // նույնպես «արված» է համարվում, որ ոչինչ երկու անգամ չսեղմվի
    const done = new Set((await readRows()).map((row) => row.result_key));
    const candidates = await findCandidates(done);
    log(`Սեղմելու տեսանյութեր՝ ${candidates.length}`);
    if (DRY_RUN) { for (const item of candidates) log(`  ${item.source} ${item.key} ${item.bytes ? mb(item.bytes) : ""}`); return; }
    if (candidates.length) await ensureFfmpeg();
    let processed = 0;
    for (const item of candidates) {
      if (Date.now() - startedAt > BUDGET_MS) { log(`Ժամանակը սպառվեց. մնացած ${candidates.length - processed}-ը՝ հաջորդ անգամ`); break; }
      processed += 1;
      log(`${processed}/${candidates.length} ${item.source} ${item.key}`);
      try {
        if (await optimizeOne(item, work)) changed = true;
      } catch (error) {
        // Ցանցի/R2-ի սխալ. ոչինչ չի գրանցվում, հաջորդ անգամ նորից կփորձվի
        log(`  սխալ՝ ${(error as Error).message.slice(0, 300)}`);
      }
    }
    if (changed) {
      // Էջերի քեշը թարմանում է, որ նոր ?v= հղումները անմիջապես երևան
      await execute(`INSERT INTO site_settings (key, value) VALUES ('cache_epoch', '${Date.now()}')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`, work);
    }
    const [total] = await query<{ files: number; before: number; after: number }>(
      "SELECT COUNT(*) files, COALESCE(SUM(original_bytes),0) before, COALESCE(SUM(optimized_bytes),0) after FROM video_optimizations WHERE status = 'optimized'");
    if (total?.files) log(`Ընդհանուր սեղմված՝ ${total.files} ֆայլ, ${mb(total.before)} → ${mb(total.after)}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await main();
