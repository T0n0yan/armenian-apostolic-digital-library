export class ResolvedTtlCache<Key, Value> {
  private readonly entries = new Map<Key, { expiresAt: number; value: Value }>();

  constructor(private readonly maximumEntries: number) {}

  get(key: Key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: Key, value: Value, ttlMs: number, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + Math.max(1, ttlMs), value });
    while (this.entries.size > Math.max(1, this.maximumEntries)) {
      const oldest = this.entries.keys().next().value as Key | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  invalidate(key?: Key) {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }

  get size() { return this.entries.size; }
}

export async function loadResolvedValue<Key, Value>(
  cache: ResolvedTtlCache<Key, Value>,
  key: Key,
  ttlMs: number,
  load: () => Promise<Value>,
) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = await load();
  cache.set(key, value, ttlMs);
  return value;
}

type SharedOperationEntry<Value> = {
  controller: AbortController;
  promise: Promise<Value>;
};

export class SharedOperationTimeoutError extends Error {
  constructor() {
    super("Shared operation timed out.");
    this.name = "SharedOperationTimeoutError";
  }
}

function waitForCaller<Value>(promise: Promise<Value>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<Value>((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

export class SharedOperationRegistry<Key, Value> {
  private readonly entries = new Map<Key, SharedOperationEntry<Value>>();

  constructor(private readonly timeoutMs: number) {}

  run(key: Key, callerSignal: AbortSignal, operation: (signal: AbortSignal) => Promise<Value>) {
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      let rejectTimeout: ((reason: unknown) => void) | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
      const timeout = setTimeout(() => {
        const error = new SharedOperationTimeoutError();
        controller.abort(error);
        rejectTimeout?.(error);
      }, Math.max(1, this.timeoutMs));
      const operationPromise = Promise.resolve().then(() => operation(controller.signal));
      const pending = Promise.race([operationPromise, timeoutPromise]).finally(() => {
        clearTimeout(timeout);
        if (this.entries.get(key)?.promise === pending) this.entries.delete(key);
      });
      entry = { controller, promise: pending };
      this.entries.set(key, entry);
    }
    return waitForCaller(entry.promise, callerSignal);
  }

  invalidate(key?: Key) {
    if (key !== undefined) {
      const entry = this.entries.get(key);
      entry?.controller.abort(new Error("Shared Telegram operation invalidated."));
      if (entry) this.entries.delete(key);
      return;
    }
    for (const entry of this.entries.values()) entry.controller.abort(new Error("Shared Telegram operations invalidated."));
    this.entries.clear();
  }

  get size() { return this.entries.size; }
}
