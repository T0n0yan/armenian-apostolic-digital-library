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
await adapter.connect();

const application = createBridgeApplication({
  adapter,
  allowedChatIds: new Set(config.allowedChatIds),
  sharedSecret: config.sharedSecret,
  mediaConcurrency: config.mediaConcurrency,
  mediaTimeoutMs: config.mediaTimeoutMs,
});

const server = createServer(async (incoming, outgoing) => {
  const abort = new AbortController();
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
        if (!outgoing.write(value)) await once(outgoing, "drain");
      }
      outgoing.end();
    } finally {
      reader.releaseLock();
    }
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Bridge request failed");
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Telegram Bridge listening on http://${config.host}:${config.port}`);
});

async function shutdown() {
  server.close();
  await adapter.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
