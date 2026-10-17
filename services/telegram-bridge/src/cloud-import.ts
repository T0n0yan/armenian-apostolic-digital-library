import { GramJsTelegramAdapter } from "./gramjs-adapter";
import { readBridgeConfig } from "./config";
import { syncTelegramLibrary, type SyncRunMode } from "./cloud-sync";
import { cloudSyncStatus, WranglerCloudSyncTarget } from "./wrangler-cloud-target";

const mode = process.argv[2] ?? "status";
if (!["dry-run", "metadata-only", "full", "resume", "reconcile", "status"].includes(mode)) {
  throw new Error("Mode must be dry-run, metadata-only, full, resume, reconcile, or status.");
}
if (mode === "status") {
  console.log(JSON.stringify(await cloudSyncStatus(), null, 2));
  process.exit(0);
}
const config = readBridgeConfig();
if (config.contentChatId !== "-1002993860753") throw new Error("Cloud import is restricted to the configured main content forum.");
const adapter = new GramJsTelegramAdapter({
  apiId: config.apiId!, apiHash: config.apiHash!, session: config.session!, allowedChatIds: [config.contentChatId],
});
const abort = new AbortController();
const stop = () => abort.abort(new Error("Import interrupted."));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  await adapter.connect();
  const target = await WranglerCloudSyncTarget.create({ metadataOnly: mode === "metadata-only" });
  const syncMode: SyncRunMode = mode === "dry-run" ? "dry-run"
    : mode === "reconcile" ? "reconcile"
      : mode === "resume" ? "incremental" : "historical";
  const result = await syncTelegramLibrary({
    adapter, target, chatId: config.contentChatId, mode: syncMode,
    dryRun: mode === "dry-run", pageSize: 50, maximumMaterials: 10_000, signal: abort.signal,
  });
  console.log(JSON.stringify({ mode, runId: result.runId, materialsSeen: result.materialsSeen, failed: result.failed }));
} finally {
  await adapter.close();
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
