import { readdir, rm } from "node:fs/promises";
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
