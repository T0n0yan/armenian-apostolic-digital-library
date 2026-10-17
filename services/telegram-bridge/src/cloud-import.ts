import { GramJsTelegramAdapter } from "./gramjs-adapter";
import { readBridgeConfig } from "./config";
import { syncTelegramChanges, syncTelegramLibrary, type SyncRunMode } from "./cloud-sync";
import type { ContentChange } from "./adapter";
import { cloudSyncStatus, WranglerCloudSyncTarget } from "./wrangler-cloud-target";

const modes = ["dry-run", "metadata-only", "full", "resume", "reconcile", "watch", "status"] as const;
const mode = process.argv[2] ?? "status";
if (!(modes as readonly string[]).includes(mode)) throw new Error(`Mode must be one of: ${modes.join(", ")}.`);
if (mode === "status") {
  console.log(JSON.stringify(await cloudSyncStatus(), null, 2));
  process.exit(0);
}
const config = readBridgeConfig();
const chatId = config.contentChatId;
if (!chatId || !config.allowedChatIds.includes(chatId)) throw new Error("TELEGRAM_CONTENT_CHAT_ID must be set and allowlisted.");
const adapter = new GramJsTelegramAdapter({
  apiId: config.apiId!, apiHash: config.apiHash!, session: config.session!, allowedChatIds: [chatId],
});
const abort = new AbortController();
const stop = () => abort.abort(new Error("Import interrupted."));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...details }));
}

/**
 * Long-running mode for the VPS: catches up with a reconcile, then applies Telegram's live
 * new/edit/delete events within seconds, and reconciles again periodically as a safety net.
 */
async function watch(target: WranglerCloudSyncTarget) {
  const debounceMs = Math.max(2_000, Number(process.env.CLOUD_SYNC_DEBOUNCE_MS ?? 8_000));
  const reconcileMs = Math.max(15 * 60_000, Number(process.env.CLOUD_SYNC_RECONCILE_MINUTES ?? 360) * 60_000);
  let pending: ContentChange[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue = Promise.resolve();
  // One sync at a time; Telegram events that arrive meanwhile wait for the next batch.
  const enqueue = (label: string, task: () => Promise<unknown>) => {
    queue = queue.then(async () => {
      if (abort.signal.aborted) return;
      const startedAt = Date.now();
      try {
        const result = await task();
        log(`${label}-done`, { ms: Date.now() - startedAt, result });
      } catch (error) {
        if (!abort.signal.aborted) log(`${label}-failed`, { ms: Date.now() - startedAt, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" });
      }
    });
  };
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // A failed or partial reconcile (network outage, a file Telegram would not serve) is retried in
  // 5 minutes instead of waiting for the next 6-hour round.
  const reconcile = () => enqueue("reconcile", async () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    try {
      const result = await syncTelegramLibrary({
        adapter, target, chatId, mode: "reconcile", pageSize: 50, maximumMaterials: 10_000, signal: abort.signal,
      });
      if (result.failed) retryTimer = setTimeout(reconcile, 5 * 60_000);
      return result;
    } catch (error) {
      if (!abort.signal.aborted) retryTimer = setTimeout(reconcile, 5 * 60_000);
      throw error;
    }
  });
  const flush = () => {
    timer = null;
    const changes = pending;
    pending = [];
    log("changes", { count: changes.length, kinds: changes.map((change) => `${change.kind}:${change.messageIds.join("+")}`) });
    enqueue("changes", () => syncTelegramChanges({ adapter, target, chatId, changes, signal: abort.signal }));
  };
  const unsubscribe = adapter.onContentChange((change) => {
    if (change.chatId !== chatId) return;
    pending.push(change);
    // Albums arrive as several messages; a short quiet period groups them into one sync.
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });
  reconcile();
  const interval = setInterval(reconcile, reconcileMs);
  // Publisher changes made on the admin page take effect within a couple of minutes.
  let publishersVersion = await target.publishersVersion(chatId).catch(() => null);
  const publisherPoll = setInterval(() => {
    void target.publishersVersion(chatId).then((version) => {
      if (publishersVersion !== null && version !== publishersVersion) {
        log("publishers-changed");
        reconcile();
      }
      publishersVersion = version;
    }).catch(() => {});
  }, 120_000);
  log("watching", { chatId, debounceMs, reconcileMinutes: reconcileMs / 60_000 });
  await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }));
  clearInterval(interval);
  clearInterval(publisherPoll);
  if (retryTimer) clearTimeout(retryTimer);
  if (timer) clearTimeout(timer);
  unsubscribe();
  await queue;
}

try {
  await adapter.connect();
  const target = await WranglerCloudSyncTarget.create({ metadataOnly: mode === "metadata-only" });
  if (mode === "watch") {
    await watch(target);
  } else {
    const syncMode: SyncRunMode = mode === "dry-run" ? "dry-run"
      : mode === "reconcile" ? "reconcile"
        : mode === "resume" ? "incremental" : "historical";
    const result = await syncTelegramLibrary({
      adapter, target, chatId, mode: syncMode,
      dryRun: mode === "dry-run", pageSize: 50, maximumMaterials: 10_000, signal: abort.signal,
    });
    console.log(JSON.stringify({ mode, runId: result.runId, materialsSeen: result.materialsSeen, failed: result.failed }));
  }
} finally {
  await adapter.close();
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
