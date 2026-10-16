import type { BridgePost, BridgePostPage } from "../../../shared/telegram-bridge-contract";
import {
  createSearchableTelegramDocument,
  matchSearchableTelegramDocument,
  parseTelegramSearchQuery,
  type ParsedTelegramSearchQuery,
  type SearchableTelegramDocument,
} from "../../../shared/telegram-search";

type IndexedPost = { post: BridgePost; document: SearchableTelegramDocument };
type IndexSnapshot = {
  entries: IndexedPost[];
  expiresAt: number;
  approximateBytes: number;
  builtAt: number;
};

export type TelegramSearchIndexMetrics = {
  documents: number;
  approximateBytes: number;
  builtAt: number | null;
  expiresAt: number | null;
  warm: boolean;
};

type SearchIndexOptions = {
  load: (signal: AbortSignal) => Promise<BridgePost[]>;
  ttlMs?: number;
  maximumDocuments?: number;
  maximumTextCharacters?: number;
  buildTimeoutMs?: number;
};

function waitForBuild<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

function cursorOffset(value: string | null, query: ParsedTelegramSearchQuery, categoryId: string | null) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { offset?: unknown; query?: unknown; categoryId?: unknown };
    return Number.isSafeInteger(parsed.offset) && Number(parsed.offset) >= 0 && parsed.query === query.normalized && parsed.categoryId === categoryId
      ? Number(parsed.offset)
      : 0;
  } catch { return 0; }
}

function nextCursor(offset: number, total: number, query: ParsedTelegramSearchQuery, categoryId: string | null) {
  return offset < total
    ? Buffer.from(JSON.stringify({ offset, query: query.normalized, categoryId })).toString("base64url")
    : null;
}

export class TelegramSearchIndex {
  private snapshot: IndexSnapshot | null = null;
  private inflight: Promise<IndexSnapshot> | null = null;
  private readonly ttlMs: number;
  private readonly maximumDocuments: number;
  private readonly maximumTextCharacters: number;
  private readonly buildTimeoutMs: number;

  constructor(private readonly options: SearchIndexOptions) {
    this.ttlMs = Math.max(5_000, options.ttlMs ?? 30_000);
    this.maximumDocuments = Math.max(1, options.maximumDocuments ?? 2_000);
    this.maximumTextCharacters = Math.max(10_000, options.maximumTextCharacters ?? 4_000_000);
    this.buildTimeoutMs = Math.max(5_000, options.buildTimeoutMs ?? 60_000);
  }

  metrics(): TelegramSearchIndexMetrics {
    return {
      documents: this.snapshot?.entries.length ?? 0,
      approximateBytes: this.snapshot?.approximateBytes ?? 0,
      builtAt: this.snapshot?.builtAt ?? null,
      expiresAt: this.snapshot?.expiresAt ?? null,
      warm: Boolean(this.snapshot && this.snapshot.expiresAt > Date.now()),
    };
  }

  invalidate() { this.snapshot = null; }

  private async build() {
    const timeout = AbortSignal.timeout(this.buildTimeoutMs);
    const posts = await this.options.load(timeout);
    const entries: IndexedPost[] = [];
    let textCharacters = 0;
    for (const post of posts) {
      if (entries.length >= this.maximumDocuments) break;
      const document = createSearchableTelegramDocument(post);
      const documentCharacters = document.fields.reduce((sum, field) => sum + Array.from(field.value).length, 0);
      if (textCharacters + documentCharacters > this.maximumTextCharacters) break;
      textCharacters += documentCharacters;
      entries.push({ post, document });
    }
    const builtAt = Date.now();
    return { entries, approximateBytes: textCharacters * 2, builtAt, expiresAt: builtAt + this.ttlMs } satisfies IndexSnapshot;
  }

  private ensure(signal: AbortSignal) {
    if (this.snapshot && this.snapshot.expiresAt > Date.now()) return Promise.resolve(this.snapshot);
    if (!this.inflight) {
      this.inflight = this.build().then((snapshot) => {
        this.snapshot = snapshot;
        return snapshot;
      }).finally(() => { this.inflight = null; });
    }
    return waitForBuild(this.inflight, signal);
  }

  async search(queryValue: string, categoryId: string | null, cursor: string | null, limit: number, signal: AbortSignal): Promise<BridgePostPage> {
    const parsed = parseTelegramSearchQuery(queryValue);
    if (!parsed.normalized || parsed.messageIdIntent) return { posts: [], nextCursor: null, total: 0 };
    const snapshot = await this.ensure(signal);
    signal.throwIfAborted();
    const matches = snapshot.entries
      .filter(({ post }) => !categoryId || post.categoryId === categoryId || post.categorySlug === categoryId)
      .map(({ post, document }) => ({ post, match: matchSearchableTelegramDocument(document, parsed) }))
      .filter((item): item is { post: BridgePost; match: NonNullable<typeof item.match> } => Boolean(item.match))
      .sort((left, right) => right.match.rank - left.match.rank ||
        (right.post.publishedAt ?? "").localeCompare(left.post.publishedAt ?? "") ||
        right.post.messageId - left.post.messageId);
    const offset = cursorOffset(cursor, parsed, categoryId);
    const page = matches.slice(offset, offset + limit);
    return {
      posts: page.map(({ post, match }) => ({ ...post, searchMatch: { scoreCategory: match.scoreCategory, reasons: match.reasons } })),
      nextCursor: nextCursor(offset + page.length, matches.length, parsed, categoryId),
      total: matches.length,
    };
  }
}
