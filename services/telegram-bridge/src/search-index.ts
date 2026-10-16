import type { BridgePost, BridgePostPage } from "../../../shared/telegram-bridge-contract";
import {
  createSearchableTelegramDocument,
  matchSearchableTelegramDocument,
  parseTelegramSearchQuery,
  type ParsedTelegramSearchQuery,
  type SearchableTelegramDocument,
} from "../../../shared/telegram-search";
import {
  DEFAULT_SEARCH_INDEX_MAX_CHARACTERS,
  DEFAULT_SEARCH_INDEX_MAX_DOCUMENTS,
} from "./config";
import { InvalidPaginationCursorError } from "./adapter";

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

type RankedMatch = {
  post: BridgePost;
  match: NonNullable<ReturnType<typeof matchSearchableTelegramDocument>>;
};

type SearchCursor = {
  version: 1;
  query: string;
  categoryId: string | null;
  rank: number;
  publishedAt: string;
  messageId: number;
  chatId: string;
  materialId: string;
};

function decodeCursor(value: string | null, query: ParsedTelegramSearchQuery, categoryId: string | null) {
  if (!value) return null;
  if (value.length > 2_000) throw new InvalidPaginationCursorError();
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SearchCursor>;
    if (parsed.version !== 1 || parsed.query !== query.normalized || parsed.categoryId !== categoryId ||
      !Number.isSafeInteger(parsed.rank) || !Number.isSafeInteger(parsed.messageId) || Number(parsed.messageId) <= 0 ||
      typeof parsed.publishedAt !== "string" || typeof parsed.chatId !== "string" || !parsed.chatId ||
      typeof parsed.materialId !== "string" || !parsed.materialId) {
      throw new InvalidPaginationCursorError();
    }
    return parsed as SearchCursor;
  } catch (error) {
    if (error instanceof InvalidPaginationCursorError) throw error;
    throw new InvalidPaginationCursorError();
  }
}

function encodeCursor(item: RankedMatch, query: ParsedTelegramSearchQuery, categoryId: string | null) {
  return Buffer.from(JSON.stringify({
    version: 1,
    query: query.normalized,
    categoryId,
    rank: item.match.rank,
    publishedAt: item.post.publishedAt ?? "",
    messageId: item.post.messageId,
    chatId: item.post.chatId,
    materialId: item.post.id,
  } satisfies SearchCursor)).toString("base64url");
}

function compareMatches(left: RankedMatch, right: RankedMatch) {
  return right.match.rank - left.match.rank ||
    (right.post.publishedAt ?? "").localeCompare(left.post.publishedAt ?? "") ||
    right.post.messageId - left.post.messageId ||
    left.post.chatId.localeCompare(right.post.chatId) ||
    left.post.id.localeCompare(right.post.id);
}

function cursorStart(matches: RankedMatch[], cursor: SearchCursor | null) {
  if (!cursor) return 0;
  const index = matches.findIndex(({ post, match }) =>
    match.rank === cursor.rank &&
    (post.publishedAt ?? "") === cursor.publishedAt &&
    post.messageId === cursor.messageId &&
    post.id === cursor.materialId
  );
  if (index >= 0) return index + 1;
  const firstAfterAnchor = matches.findIndex(({ post, match }) =>
    match.rank < cursor.rank ||
    (match.rank === cursor.rank && (post.publishedAt ?? "") < cursor.publishedAt) ||
    (match.rank === cursor.rank && (post.publishedAt ?? "") === cursor.publishedAt && post.messageId < cursor.messageId) ||
    (match.rank === cursor.rank && (post.publishedAt ?? "") === cursor.publishedAt && post.messageId === cursor.messageId && post.chatId > cursor.chatId) ||
    (match.rank === cursor.rank && (post.publishedAt ?? "") === cursor.publishedAt && post.messageId === cursor.messageId && post.chatId === cursor.chatId && post.id > cursor.materialId)
  );
  return firstAfterAnchor < 0 ? matches.length : firstAfterAnchor;
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
    this.maximumDocuments = Math.max(1, options.maximumDocuments ?? DEFAULT_SEARCH_INDEX_MAX_DOCUMENTS);
    this.maximumTextCharacters = Math.max(10_000, options.maximumTextCharacters ?? DEFAULT_SEARCH_INDEX_MAX_CHARACTERS);
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
    const matches: RankedMatch[] = snapshot.entries
      .filter(({ post }) => !categoryId || post.categoryId === categoryId || post.categorySlug === categoryId)
      .map(({ post, document }) => ({ post, match: matchSearchableTelegramDocument(document, parsed) }))
      .filter((item): item is { post: BridgePost; match: NonNullable<typeof item.match> } => Boolean(item.match))
      .sort(compareMatches);
    const safeLimit = Math.max(1, Math.min(20, limit));
    const start = cursorStart(matches, decodeCursor(cursor, parsed, categoryId));
    const page = matches.slice(start, start + safeLimit);
    const last = page.at(-1);
    return {
      posts: page.map(({ post, match }) => ({ ...post, searchMatch: { scoreCategory: match.scoreCategory, reasons: match.reasons } })),
      nextCursor: last && start + page.length < matches.length ? encodeCursor(last, parsed, categoryId) : null,
      total: matches.length,
    };
  }
}
