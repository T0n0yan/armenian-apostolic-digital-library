import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const buildDirectory = resolve(import.meta.dirname, "../build");
const secretFilePattern = /^(?:\.dev\.vars|\.env)(?:\..+)?$/u;

async function removeLocalSecretCopies(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await removeLocalSecretCopies(path);
    } else if (entry.isFile() && secretFilePattern.test(entry.name)) {
      await rm(path);
    }
  }));
}

await removeLocalSecretCopies(buildDirectory);

// Files copied as they are (MapLibre's worker, imported with ?url) keep a sourceMappingURL to a
// map that isn't in the build; Wrangler refuses such a bundle when it uploads source maps.
async function dropDanglingSourceMaps(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return dropDanglingSourceMaps(path);
    if (!entry.isFile() || !/\.m?js$/u.test(entry.name)) return;
    const text = await readFile(path, "utf8");
    const match = /\n\/\/# sourceMappingURL=([^\s]+)\s*$/u.exec(text);
    if (!match || match[1].startsWith("data:")) return;
    try {
      await access(resolve(directory, match[1]));
    } catch {
      await writeFile(path, text.slice(0, match.index + 1));
    }
  }));
}

await dropDanglingSourceMaps(buildDirectory);
