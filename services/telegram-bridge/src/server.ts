import { createServer } from "node:http";
import { once } from "node:events";

import { createBridgeApplication } from "./app";
import { readBridgeConfig } from "./config";
import { GramJsTelegramAdapter } from "./gramjs-adapter";
import { MockTelegramAdapter } from "./mock-adapter";

const config = readBridgeConfig();
const adapter = config.adapter === "mock"
  ? new MockTelegramAdapter()
  : new GramJsTelegramAdapter({
      apiId: config.apiId!,
      apiHash: config.apiHash!,
      session: config.session!,
      allowedChatIds: config.allowedChatIds,
    });
let ready = false;
await adapter.connect();
ready = true;

const application = createBridgeApplication({
  adapter,
  allowedChatIds: new Set(config.allowedChatIds),
  sharedSecret: config.sharedSecret,
  mediaConcurrency: config.mediaConcurrency,
  mediaTimeoutMs: config.mediaTimeoutMs,
  isReady: () => ready,
});

let activeRequests = 0;
const server = createServer(async (incoming, outgoing) => {
  if (activeRequests >= config.requestConcurrency) {
    outgoing.writeHead(503, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "retry-after": "1",
    });
    outgoing.end("Bridge is busy");
    return;
  }
  activeRequests += 1;
  const abort = new AbortController();
  const pathname = new URL(incoming.url || "/", "http://bridge.invalid").pathname;
  const timeoutMs = pathname.startsWith("/media/") ? config.mediaTimeoutMs : config.requestTimeoutMs;
  const timeout = setTimeout(() => abort.abort(new Error("Bridge request timed out.")), timeoutMs);
  timeout.unref();
  incoming.once("aborted", () => abort.abort(new Error("Client disconnected.")));
  outgoing.once("close", () => {
    if (!outgoing.writableEnded) abort.abort(new Error("Client disconnected."));
  });
  try {
    const origin = `http://${incoming.headers.host || `${config.host}:${config.port}`}`;
    const request = new Request(new URL(incoming.url || "/", origin), {
      method: incoming.method,
      headers: Object.entries(incoming.headers).flatMap(([name, value]) =>
        value === undefined ? [] : Array.isArray(value) ? value.map((item) => [name, item] as [string, string]) : [[name, value]],
      ),
      signal: abort.signal,
    });
    const response = await application(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body || incoming.method === "HEAD") { outgoing.end(); return; }
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!outgoing.write(value)) {
          await Promise.race([once(outgoing, "drain"), once(outgoing, "close")]);
          if (outgoing.destroyed) throw new Error("Client disconnected.");
        }
      }
      outgoing.end();
    } finally {
      reader.releaseLock();
    }
  } catch {
    if (!outgoing.destroyed) {
      if (!outgoing.headersSent) {
        outgoing.writeHead(abort.signal.aborted ? 504 : 500, {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        });
      }
      outgoing.end(abort.signal.aborted ? "Bridge request timed out" : "Bridge request failed");
    }
  } finally {
    clearTimeout(timeout);
    activeRequests -= 1;
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Telegram Bridge listening on http://${config.host}:${config.port}`);
});

let shutdownPromise: Promise<void> | null = null;
function shutdown() {
  shutdownPromise ??= (async () => {
    ready = false;
    const forceClose = setTimeout(() => server.closeAllConnections(), config.shutdownGraceMs);
    forceClose.unref();
    server.close();
    server.closeIdleConnections();
    await once(server, "close");
    clearTimeout(forceClose);
    await adapter.close();
    console.log("Telegram Bridge shutdown complete.");
  })();
  return shutdownPromise;
}
function requestShutdown() {
  void shutdown().catch(() => {
    process.exitCode = 1;
  });
}
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
