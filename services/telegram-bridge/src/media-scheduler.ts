export class MediaQueueOverloadedError extends Error {
  constructor() {
    super("The media queue is full.");
    this.name = "MediaQueueOverloadedError";
  }
}

type Waiter = {
  key: string;
  clientKey: string;
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason?: unknown) => void;
  aborted: () => void;
};

export class MediaScheduler {
  private active = 0;
  private readonly activeByKey = new Map<string, number>();
  private readonly activeByClient = new Map<string, number>();
  private readonly waiters: Waiter[] = [];
  private lastStartedKey: string | null = null;

  constructor(
    private readonly maximum: number,
    private readonly maximumQueued: number,
    private readonly maximumPerKey: number,
    private readonly maximumPerClient: number,
  ) {}

  get activeCount() { return this.active; }
  get queuedCount() { return this.waiters.length; }

  acquire(key: string, clientKey: string, signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    if (this.canStart(key, clientKey)) return Promise.resolve(this.start(key, clientKey));
    if (this.waiters.length >= this.maximumQueued) return Promise.reject(new MediaQueueOverloadedError());

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        key,
        clientKey,
        signal,
        resolve,
        reject,
        aborted: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(signal.reason);
          this.drain();
        },
      };
      signal.addEventListener("abort", waiter.aborted, { once: true });
      this.waiters.push(waiter);
      this.drain();
    });
  }

  private canStart(key: string, clientKey: string) {
    return this.active < this.maximum
      && (this.activeByKey.get(key) ?? 0) < this.maximumPerKey
      && (this.activeByClient.get(clientKey) ?? 0) < this.maximumPerClient;
  }

  private start(key: string, clientKey: string) {
    this.active += 1;
    this.lastStartedKey = key;
    this.activeByKey.set(key, (this.activeByKey.get(key) ?? 0) + 1);
    this.activeByClient.set(clientKey, (this.activeByClient.get(clientKey) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const remaining = (this.activeByKey.get(key) ?? 1) - 1;
      if (remaining > 0) this.activeByKey.set(key, remaining);
      else this.activeByKey.delete(key);
      const clientRemaining = (this.activeByClient.get(clientKey) ?? 1) - 1;
      if (clientRemaining > 0) this.activeByClient.set(clientKey, clientRemaining);
      else this.activeByClient.delete(clientKey);
      this.drain();
    };
  }

  private drain() {
    while (this.active < this.maximum) {
      const eligible = (waiter: Waiter) => !waiter.signal.aborted && this.canStart(waiter.key, waiter.clientKey);
      let index = this.waiters.findIndex((waiter) => eligible(waiter) && waiter.key !== this.lastStartedKey);
      if (index < 0) index = this.waiters.findIndex(eligible);
      if (index < 0) return;
      const [waiter] = this.waiters.splice(index, 1);
      waiter.signal.removeEventListener("abort", waiter.aborted);
      waiter.resolve(this.start(waiter.key, waiter.clientKey));
    }
  }
}
