/** Explicit speech-only derivative. Never replaces or uploads the original. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
const [flag, input, directory] = process.argv.slice(2);
if (flag !== "--speech" || !input || !directory) throw Error("Usage: node scripts/prepare-speech.mjs --speech INPUT OUTPUT_DIRECTORY (speech only, not music)");
const source = resolve(input), output = resolve(directory);
if (!(await stat(source)).isFile()) throw Error("Input must be a regular file");
await mkdir(output, { recursive: true });
const hash = createHash("sha256");for await (const chunk of createReadStream(source)) hash.update(chunk);
const key = hash.digest("hex") + "-speech-mp3-mono64-v1";
const target = join(output, key + ".mp3"), manifest = join(output, key + ".json");
try { const prior = JSON.parse(await readFile(manifest, "utf8"));if ((await stat(target)).size === prior.bytes) { console.log("Derivative already prepared");process.exit(0); } } catch { /* prepare */ }
const temporary = target + `.${process.pid}.tmp.mp3`;
try {
  await new Promise((done, fail) => {
    const child = spawn("ffmpeg", ["-nostdin", "-v", "error", "-n", "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", temporary], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume(); child.on("error", fail); child.on("close", code => code === 0 ? done() : fail(Error(`ffmpeg exit ${code}`)));
  });
  await rename(temporary, target);
  await writeFile(manifest, JSON.stringify({ sourceSha256: key.slice(0,64), profile: "speech-mp3-mono64-v1", bytes: (await stat(target)).size }, null, 2));
  console.log("Speech derivative prepared; original preserved. Listen before publishing.");
} finally { await unlink(temporary).catch(() => {}); }
