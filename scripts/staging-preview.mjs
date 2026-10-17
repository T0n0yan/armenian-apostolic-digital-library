import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = resolve(repositoryRoot, ".local-artifacts/runtime");
const statePath = resolve(runtimeDirectory, "staging-preview.json");
const bridgeLogPath = resolve(runtimeDirectory, "bridge.log");
const tunnelLogPath = resolve(runtimeDirectory, "cloudflared.log");
const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

export function isProcessAlive(pid, signal = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try { signal(pid, 0); return true; } catch { return false; }
}

export function readPreviewRuntimeState(path = statePath) {
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    if (state.repositoryRoot !== repositoryRoot) return null;
    if (![state.supervisorPid, state.bridgePid, state.tunnelPid].every((pid) => Number.isSafeInteger(pid) && pid > 1)) return null;
    return state;
  } catch {
    return null;
  }
}

export function previewRuntimeStatus(state = readPreviewRuntimeState(), alive = isProcessAlive) {
  return {
    configured: Boolean(state),
    supervisor: Boolean(state && alive(state.supervisorPid)),
    bridge: Boolean(state && alive(state.bridgePid)),
    tunnel: Boolean(state && alive(state.tunnelPid)),
  };
}

function saveState(state) {
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function removeState() {
  rmSync(statePath, { force: true });
}

function openLog(path) {
  return openSync(path, "a", 0o600);
}

async function terminate(child, timeoutMs = 15_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function start() {
  const current = previewRuntimeStatus();
  if (current.supervisor || current.bridge || current.tunnel) throw new Error("The staging preview supervisor is already running.");
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  const bridgeLog = openLog(bridgeLogPath);
  const tunnelLog = openLog(tunnelLogPath);
  const bridge = spawn(process.execPath, [
    "--env-file-if-exists=services/telegram-bridge/.env.local",
    "--import", "tsx",
    "services/telegram-bridge/src/server.ts",
  ], { cwd: repositoryRoot, stdio: ["ignore", bridgeLog, bridgeLog] });
  const tunnel = spawn("cloudflared", ["tunnel", "--config", ".cloudflared-staging/config.yml", "run"], {
    cwd: repositoryRoot,
    stdio: ["ignore", tunnelLog, tunnelLog],
  });
  closeSync(bridgeLog);
  closeSync(tunnelLog);
  saveState({ repositoryRoot, supervisorPid: process.pid, bridgePid: bridge.pid, tunnelPid: tunnel.pid, startedAt: new Date().toISOString() });
  process.stdout.write("Staging preview supervisor started. Use `pnpm staging:preview:status` from another terminal.\n");

  let shutdownPromise = null;
  const shutdown = () => {
    shutdownPromise ??= (async () => {
      await terminate(tunnel);
      await terminate(bridge);
      removeState();
    })();
    return shutdownPromise;
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  const [name, code, signal] = await Promise.race([
    new Promise((resolvePromise) => bridge.once("exit", (code, signal) => resolvePromise(["Bridge", code, signal]))),
    new Promise((resolvePromise) => tunnel.once("exit", (code, signal) => resolvePromise(["Tunnel", code, signal]))),
  ]);
  const expected = Boolean(shutdownPromise);
  await shutdown();
  if (!expected || (code !== 0 && signal !== "SIGTERM")) throw new Error(`${name} exited unexpectedly.`);
}

async function status() {
  const state = readPreviewRuntimeState();
  const current = previewRuntimeStatus(state);
  process.stdout.write(`Supervisor: ${current.supervisor ? "running" : "stopped"}\n`);
  process.stdout.write(`Bridge: ${current.bridge ? "running" : "stopped"}\n`);
  process.stdout.write(`Tunnel: ${current.tunnel ? "running" : "stopped"}\n`);
  if (!current.supervisor && !current.bridge && !current.tunnel) removeState();
}

async function stop() {
  const state = readPreviewRuntimeState();
  if (!state || !isProcessAlive(state.supervisorPid)) {
    removeState();
    process.stdout.write("Staging preview supervisor is already stopped.\n");
    return;
  }
  process.kill(state.supervisorPid, "SIGTERM");
  for (let attempt = 0; attempt < 150 && isProcessAlive(state.supervisorPid); attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (isProcessAlive(state.supervisorPid)) throw new Error("Staging preview supervisor did not stop within 15 seconds.");
  removeState();
  process.stdout.write("Staging preview supervisor stopped.\n");
}

const command = process.argv[2];
if (!command && isMain) {
  process.stderr.write("Usage: node scripts/staging-preview.mjs <start|status|stop>\n");
  process.exitCode = 1;
} else if (isMain) {
  const run = command === "start" ? start : command === "status" ? status : command === "stop" ? stop : null;
  if (!run) {
    process.stderr.write("Unknown staging preview command.\n");
    process.exitCode = 1;
  } else {
    run().catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Staging preview command failed."}\n`);
      process.exitCode = 1;
    });
  }
}
