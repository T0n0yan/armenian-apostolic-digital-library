import { createServer, type ServerResponse } from "node:http";
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
  searchIndexTtlMs: config.searchIndexTtlMs,
  searchIndexMaximumDocuments: config.searchIndexMaximumDocuments,
  searchIndexMaximumTextCharacters: config.searchIndexMaximumTextCharacters,
  searchIndexBuildTimeoutMs: config.searchIndexBuildTimeoutMs,
  isReady: () => ready,
  onMetric: (metric) => console.info(JSON.stringify({ event: "telegram_metric", ...metric })),
});

let activeRequests = 0;
let activeMediaRequests = 0;
let requestSequence = 0;

function waitForDrainOrClose(outgoing: ServerResponse) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      outgoing.off("drain", drained);
      outgoing.off("close", closed);
      outgoing.off("error", failed);
    };
    const drained = () => { cleanup(); resolve(); };
    const closed = () => { cleanup(); reject(new Error("Client disconnected.")); };
    const failed = () => { cleanup(); reject(new Error("Client connection failed.")); };
    outgoing.once("drain", drained);
    outgoing.once("close", closed);
    outgoing.once("error", failed);
  });
}

function requestMetadata(pathname: string) {
  const media = /^\/media\/-?\d{1,20}\/(\d{1,20})\/(\d{1,3})$/u.exec(pathname);
  if (media) return { kind: "media", messageId: Number(media[1]), mediaIndex: Number(media[2]) };
  if (pathname === "/categories" || pathname === "/topics") return { kind: "topics" };
  if (pathname === "/search") return { kind: "search" };
  if (/^\/categories\/[^/]+\/posts$/u.test(pathname)) return { kind: "topic-posts" };
  if (/^\/posts\//u.test(pathname)) return { kind: "post" };
  return { kind: "other" };
}

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
  const isMediaRequest = pathname.startsWith("/media/");
  if (isMediaRequest) activeMediaRequests += 1;
  const mediaRequestsAtStart = activeMediaRequests;
  const requestId = ++requestSequence;
  const startedAt = performance.now();
  let responseStatus = 500;
  let bytesWritten = 0;
  let outcome = "ok";
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
    const applicationStartedAt = performance.now();
    const response = await application(request);
    responseStatus = response.status;
    const responseHeaders = new Headers(response.headers);
    responseHeaders.append("server-timing", `bridge-app;dur=${(performance.now() - applicationStartedAt).toFixed(1)}`);
    outgoing.writeHead(response.status, Object.fromEntries(responseHeaders.entries()));
    if (!response.body || incoming.method === "HEAD") { outgoing.end(); return; }
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesWritten += value.byteLength;
        if (!outgoing.write(value)) {
          await waitForDrainOrClose(outgoing);
          if (outgoing.destroyed) throw new Error("Client disconnected.");
        }
      }
      outgoing.end();
    } finally {
      reader.releaseLock();
    }
  } catch {
    outcome = abort.signal.aborted
      ? abort.signal.reason instanceof Error && /disconnect/iu.test(abort.signal.reason.message)
        ? "aborted"
        : "timeout"
      : "error";
    responseStatus = abort.signal.aborted ? 504 : 500;
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
    if (isMediaRequest) activeMediaRequests -= 1;
    console.info(JSON.stringify({
      event: "bridge_request",
      requestId,
      method: incoming.method ?? "GET",
      ...requestMetadata(pathname),
      status: responseStatus,
      durationMs: Math.round(performance.now() - startedAt),
      bytesWritten,
      activeRequests,
      activeMediaRequests,
      mediaRequestsAtStart,
      outcome,
    }));
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
