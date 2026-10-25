import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { searchValidation } from "../app/utils/search-validation";
import { safeReturnPath } from "../app/utils/return-path";
import { cloudMediaObjectKey, telegramMaterialContentHash } from "../services/telegram-bridge/src/cloud-sync";
import type { TelegramPost } from "../services/telegram-bridge/src/adapter";

test("search accepts meaningful text and section-specific psalm numbers, rejects empty and symbol-only queries", () => {
  for (const input of ["", "     ", "!!!", "✅", "\u200b", "123", "0", "151"]) assert.ok(searchValidation(input));
  for (const input of ["Հայր մեր", "saxmos", "Սաղմոս 22", "աղոթք։"]) assert.equal(searchValidation(input), null);
  for (const input of ["1", "22", "150"]) assert.equal(searchValidation(input, true), null);
  for (const input of ["0", "151", "!!!", " "]) assert.ok(searchValidation(input, true));
});

test("OAuth return paths never allow another origin or backslash redirects", () => {
  assert.equal(safeReturnPath("/psalms/22?q=test#verse-3"), "/psalms/22?q=test#verse-3");
  for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "/\n/evil.example", null]) assert.equal(safeReturnPath(value), "/saved");
});

test("caption edits reuse Telegram file keys, replacements get new keys, legacy hashes remain compatible", async () => {
  const media = { index: 0, kind: "video", mimeType: "video/mp4", sourceFileId: "document-123", hasThumbnail: true } as TelegramPost["media"][number];
  const post = { chatId: "-100", messageId: 1, title: "before", media: [media] } as TelegramPost;
  const hash = await telegramMaterialContentHash(post);
  const edited = { ...post, title: "after" };
  const editedHash = await telegramMaterialContentHash(edited);
  assert.notEqual(hash, editedHash);
  const key = cloudMediaObjectKey({ post, contentHash: hash }, media);
  assert.equal(key, cloudMediaObjectKey({ post: edited, contentHash: editedHash }, media));
  assert.notEqual(key, cloudMediaObjectKey({ post, contentHash: hash }, { ...media, sourceFileId: "document-456" }));
  const legacy = { ...post, media: [{ ...media, sourceFileId: undefined }] };
  assert.equal(await telegramMaterialContentHash(post, true), await telegramMaterialContentHash(legacy));
});

test("service worker never stores private page data and purges public page copies on account writes", async () => {
  const stores = new Map<string, Map<string, Response>>();
  const handlers: Record<string, (event: any) => void> = {};
  const key = (request: string | Request) => typeof request === "string" ? request : request.url;
  const caches = {
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (request: string | Request) => store.get(key(request))?.clone(),
        put: async (request: string | Request, response: Response) => { store.set(key(request), response.clone()); },
        keys: async () => [...store.keys()].map((url) => new Request(url)),
        delete: async (request: Request) => store.delete(request.url),
      };
    },
  };
  let offline = false;
  let publicResponse = false;
  const context = vm.createContext({
    self: { location: { origin: "https://library.test" }, addEventListener: (name: string, callback: (event: any) => void) => { handlers[name] = callback; } },
    caches, Response, Headers, URL, Date, console,
    setTimeout: (callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
    fetch: async () => {
      if (offline) throw new Error("offline");
      return new Response(publicResponse ? "PUBLIC" : "PRIVATE_ACCOUNT", { headers: publicResponse
        ? { "X-Offline-Public": "1", "Cache-Control": "public, max-age=30" }
        : { "Cache-Control": "private, no-store" } });
    },
  });
  vm.runInContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  const request = new Request("https://library.test/psalms/22.data");
  await context.networkFirst(request, "v1");
  assert.equal(stores.get("pages-v6")?.size, 0);
  offline = true;
  await assert.rejects(context.networkFirst(request), /offline/);
  offline = false; publicResponse = true;
  await context.networkFirst(request, "v1");
  offline = true;
  assert.equal(await (await context.networkFirst(request)).text(), "PUBLIC");
  let pending: Promise<unknown> = Promise.resolve();
  handlers.fetch({ request: new Request("https://library.test/auth/logout", { method: "POST" }), waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  assert.equal(stores.has("pages-v6"), false);
  await assert.rejects(context.networkFirst(request), /offline/);
});

test("failed reminder cancellation keeps the pending reminder and emits a visible error event", async () => {
  const store = await import("../app/utils/reminder-store");
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = new EventTarget();
  Object.assign(browser, { setTimeout });
  Object.defineProperty(globalThis, "window", { value: browser, configurable: true });
  let errors = 0;
  browser.addEventListener(store.REMINDER_ERROR_EVENT, () => { errors += 1; });
  try {
    store.setRemindersEnabled(true);
    globalThis.fetch = async () => Response.json({ reminders: [{ materialId: "qa-reminder", at: "2030-01-01", repeat: "none", title: "QA", categoryName: null }], missed: [] });
    await store.loadReminders({ fresh: true });
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await store.cancelReminder("qa-reminder");
    assert.ok(errors > 0);
    assert.equal((await store.loadReminders({ fresh: true }))[0]?.materialId, "qa-reminder");
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    store.setRemindersEnabled(false);
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("existing unchanged media is not reuploaded during the file-identity rollout", async () => {
  const { WranglerCloudSyncTarget } = await import("../services/telegram-bridge/src/wrangler-cloud-target");
  // Construct only in-memory state; never call create(), uploadMedia() or a remote command.
  const target = Reflect.construct(WranglerCloudSyncTarget, [false]) as import("../services/telegram-bridge/src/wrangler-cloud-target").WranglerCloudSyncTarget;
  const state = target as unknown as { hashes: Map<string, string>; published: Map<string, string | null>; objectKeys: Set<string> };
  const media = { index: 0, kind: "video", mimeType: "video/mp4", sourceFileId: "document-123", hasThumbnail: false } as TelegramPost["media"][number];
  const post = { chatId: "-100", messageId: 1, title: "before", media: [media], authorId: null } as TelegramPost;
  const contentHash = await telegramMaterialContentHash(post);
  const legacyContentHash = await telegramMaterialContentHash(post, true);
  const topic = { id: "qa-topic" } as Parameters<typeof target.isCurrent>[0]["topic"];
  const material = { post, topic, contentHash, legacyContentHash, sourceRevision: "1" };
  state.hashes.set("-100:1", legacyContentHash);
  state.published.set("-100:1", null);
  state.objectKeys.add(cloudMediaObjectKey({ post, contentHash: legacyContentHash }, { ...media, sourceFileId: null }));
  assert.equal(target.isCurrent(material), true);
  const changed = { ...post, title: "edited" };
  const edited = { ...material, post: changed, contentHash: await telegramMaterialContentHash(changed), legacyContentHash: await telegramMaterialContentHash(changed, true) };
  assert.equal(target.isCurrent(edited), false);
  assert.equal((await target.stageMaterial(edited, false)).mediaToUpload.length, 1);
  state.objectKeys.add(cloudMediaObjectKey(edited, media));
  assert.equal((await target.stageMaterial(edited, false)).mediaToUpload.length, 0);
});
