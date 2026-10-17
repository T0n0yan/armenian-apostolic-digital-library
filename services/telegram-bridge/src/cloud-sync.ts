import type { BridgeCategory, BridgeMedia } from "../../../shared/telegram-bridge-contract";
import type { ContentChange, TelegramAdapter, TelegramAdmin, TelegramPost } from "./adapter";

export type SyncCheckpoint = { cursor: string | null; complete: boolean };
export type SyncRunMode = "dry-run" | "historical" | "incremental" | "reconcile";

export type SyncMaterial = {
  post: TelegramPost;
  topic: BridgeCategory;
  contentHash: string;
  sourceRevision: string;
};

export type SyncMediaUpload = {
  chatId: string;
  messageId: number;
  mediaIndex: number;
  thumbnail: boolean;
  objectKey: string;
  descriptor: BridgeMedia;
  body: AsyncIterable<Uint8Array>;
};

/**
 * Storage boundary used by the importer. Implementations may use D1 and R2,
 * but public content bytes must never be persisted by the Bridge itself.
 */
export interface CloudLibrarySyncTarget {
  beginRun(input: { chatId: string; mode: SyncRunMode; dryRun: boolean }): Promise<string>;
  upsertSource(input: { chatId: string; topics: BridgeCategory[]; dryRun: boolean }): Promise<void>;
  upsertTopic(topic: BridgeCategory, dryRun: boolean): Promise<void>;
  getCheckpoint(chatId: string, topicId: number): Promise<SyncCheckpoint | null>;
  /** True when the stored copy is already identical and public, so the post needs no writes. */
  isCurrent?(material: SyncMaterial): boolean;
  stageMaterial(material: SyncMaterial, dryRun: boolean): Promise<{
    mediaToUpload: Array<{ mediaIndex: number; thumbnail: boolean }>;
  }>;
  uploadMedia(media: SyncMediaUpload, dryRun: boolean): Promise<void>;
  commitMaterial(material: SyncMaterial, dryRun: boolean): Promise<void>;
  recordFailure(input: {
    runId: string; chatId: string; messageId: number; mediaIndex: number | null;
    stage: "material" | "media"; code: string; retryable: boolean; dryRun: boolean;
  }): Promise<void>;
  saveCheckpoint(input: { chatId: string; topicId: number; cursor: string | null; complete: boolean; dryRun: boolean }): Promise<void>;
  finishRun(input: { runId: string; status: "complete" | "failed" | "cancelled"; dryRun: boolean }): Promise<void>;
  /**
   * Mirrors the chat's current Telegram admins (null when unavailable) and returns who may publish.
   * Optional so simple targets (tests, dry runs) can publish everything.
   */
  syncPublishers?(input: { chatId: string; admins: TelegramAdmin[] | null; dryRun: boolean }): Promise<PublisherPolicy>;
  recordAuthors?(input: { chatId: string; authors: AuthorTally[]; dryRun: boolean }): Promise<void>;
  /** Takes materials off the public site (deleted in Telegram, or withheld because of the author). */
  markDeleted?(input: { chatId: string; messageIds: number[]; dryRun: boolean }): Promise<void>;
  /** Public material IDs currently stored for a chat, to find posts deleted while sync was offline. */
  listStoredMessageIds?(chatId: string): Promise<number[]>;
}

export type PublisherPolicy = { allowed: Set<string>; blocked: Set<string> };
export type AuthorTally = { userId: string; displayName: string; posts: number; withheld: number; lastPostAt: string | null };

/**
 * Admins, allowed users and anonymous admins (posting as the group itself) publish. Any member can
 * post "as" their own channel, so a channel author publishes only once it is explicitly allowed.
 */
export function mayPublish(policy: PublisherPolicy | null, chatId: string, authorId: string | null | undefined) {
  if (!policy) return true;
  if (authorId && policy.blocked.has(authorId)) return false;
  if (!authorId || authorId === chatId) return true;
  return policy.allowed.has(authorId);
}

export type CloudSyncOptions = {
  adapter: TelegramAdapter;
  target: CloudLibrarySyncTarget;
  chatId: string;
  mode: SyncRunMode;
  dryRun?: boolean;
  pageSize?: number;
  maximumMaterials?: number;
  signal: AbortSignal;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export async function telegramMaterialContentHash(post: TelegramPost) {
  const payload = JSON.stringify(stable({
    ...post,
    searchMatch: undefined,
    // Author fields arrived after the first import; keep them out so existing hashes (and the
    // immutable R2 keys derived from them) stay valid.
    authorId: undefined,
    authorName: undefined,
    media: post.media.map(({ hasThumbnail: _hasThumbnail, ...media }) => media),
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeExtension(media: BridgeMedia) {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg",
    "application/pdf": "pdf",
  };
  const named = media.fileName?.match(/\.([a-zA-Z0-9]{1,8})$/u)?.[1]?.toLowerCase();
  return (named && /^[a-z0-9]+$/u.test(named) ? named : null) ?? byMime[media.mimeType ?? ""] ?? "bin";
}

export function cloudMediaObjectKey(
  material: Pick<SyncMaterial, "post" | "contentHash">,
  media: BridgeMedia,
  thumbnail = false,
) {
  return `v1/${material.post.chatId}/${material.post.messageId}/${material.contentHash}/${media.index}/${thumbnail ? "thumbnail.jpg" : `original.${safeExtension(media)}`}`;
}

function failureCode(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "aborted";
  if (error instanceof Error) {
    const value = /^[a-z][a-z0-9_-]{0,63}$/iu.test(error.message) ? error.message : error.name;
    if (/^[a-z][a-z0-9_-]{0,63}$/iu.test(value)) {
      return value.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();
    }
  }
  return "sync-failed";
}

type SyncContext = {
  adapter: TelegramAdapter;
  target: CloudLibrarySyncTarget;
  chatId: string;
  runId: string;
  dryRun: boolean;
  policy: PublisherPolicy | null;
  authors: Map<string, AuthorTally>;
  signal: AbortSignal;
};

async function loadPolicy(adapter: TelegramAdapter, target: CloudLibrarySyncTarget, chatId: string, dryRun: boolean, signal: AbortSignal) {
  if (!target.syncPublishers) return null;
  let admins: TelegramAdmin[] | null = null;
  if (adapter.listAdmins) {
    try { admins = await adapter.listAdmins(chatId, signal); } catch (error) { if (signal.aborted) throw error; }
  }
  return target.syncPublishers({ chatId, admins, dryRun });
}

function tallyAuthor(context: SyncContext, post: TelegramPost, withheld: boolean) {
  if (!post.authorId || post.authorId === context.chatId) return;
  const tally = context.authors.get(post.authorId) ?? { userId: post.authorId, displayName: post.authorName ?? "", posts: 0, withheld: 0, lastPostAt: null };
  tally.posts += 1;
  if (withheld) tally.withheld += 1;
  if (post.authorName) tally.displayName = post.authorName;
  if (post.publishedAt && (!tally.lastPostAt || post.publishedAt > tally.lastPostAt)) tally.lastPostAt = post.publishedAt;
  context.authors.set(post.authorId, tally);
}

/** Stages, uploads media for, and commits one post; withholds it if its author may not publish. Returns false on failure. */
async function syncPost(context: SyncContext, post: TelegramPost, topic: BridgeCategory) {
  const { adapter, target, runId, dryRun, signal } = context;
  const allowed = mayPublish(context.policy, context.chatId, post.authorId);
  tallyAuthor(context, post, !allowed);
  if (!allowed) {
    await target.markDeleted?.({ chatId: post.chatId, messageIds: [post.messageId], dryRun });
    return true;
  }
  let ok = true;
  const contentHash = await telegramMaterialContentHash(post);
  const material: SyncMaterial = {
    post, topic, contentHash,
    sourceRevision: post.editedAt ?? post.publishedAt ?? `${post.messageId}`,
  };
  if (target.isCurrent?.(material)) return true;
  try {
    const staged = await target.stageMaterial(material, dryRun);
    for (const asset of staged.mediaToUpload) {
      try {
        const descriptor = await adapter.getMediaDescriptor(post.chatId, post.messageId, asset.mediaIndex, signal, asset.thumbnail);
        if (!descriptor) throw new Error("MediaUnavailable");
        if (descriptor.sizeBytes === null || descriptor.sizeBytes <= 0) throw new Error("MediaSizeUnavailable");
        const end = descriptor.sizeBytes - 1;
        await target.uploadMedia({
          chatId: post.chatId,
          messageId: post.messageId,
          mediaIndex: asset.mediaIndex,
          thumbnail: asset.thumbnail,
          objectKey: cloudMediaObjectKey(material, descriptor, asset.thumbnail),
          descriptor,
          body: adapter.streamMedia({
            chatId: post.chatId, messageId: post.messageId, mediaIndex: asset.mediaIndex,
            start: 0, end, thumbnail: asset.thumbnail, signal,
          }),
        }, dryRun);
      } catch (error) {
        if (signal.aborted) throw error;
        ok = false;
        await target.recordFailure({
          runId, chatId: post.chatId, messageId: post.messageId,
          mediaIndex: asset.thumbnail ? -(asset.mediaIndex + 1) : asset.mediaIndex,
          stage: "media", code: failureCode(error), retryable: true, dryRun,
        });
      }
    }
    await target.commitMaterial(material, dryRun);
  } catch (error) {
    if (signal.aborted) throw error;
    ok = false;
    await target.recordFailure({
      runId, chatId: post.chatId, messageId: post.messageId, mediaIndex: null,
      stage: "material", code: failureCode(error), retryable: true, dryRun,
    });
  }
  return ok;
}

export async function syncTelegramLibrary(options: CloudSyncOptions) {
  const dryRun = options.dryRun ?? options.mode === "dry-run";
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const maximumMaterials = Math.min(100_000, Math.max(1, options.maximumMaterials ?? 10_000));
  const runId = await options.target.beginRun({ chatId: options.chatId, mode: options.mode, dryRun });
  let seen = 0;
  let failed = false;
  let walkedEverything = true;
  const seenMessageIds = new Set<number>();
  try {
    options.signal.throwIfAborted();
    const topics = (await options.adapter.listTopics({ refresh: true, signal: options.signal }))
      .filter((topic) => topic.chatId === options.chatId && !topic.isGeneral && topic.topicId !== null);
    await options.target.upsertSource({ chatId: options.chatId, topics, dryRun });
    const context: SyncContext = {
      adapter: options.adapter, target: options.target, chatId: options.chatId, runId, dryRun,
      policy: await loadPolicy(options.adapter, options.target, options.chatId, dryRun, options.signal),
      authors: new Map(), signal: options.signal,
    };
    for (const topic of topics) {
      options.signal.throwIfAborted();
      await options.target.upsertTopic(topic, dryRun);
      const checkpoint = await options.target.getCheckpoint(options.chatId, topic.topicId!);
      if (checkpoint?.complete && options.mode === "historical") { walkedEverything = false; continue; }
      // A reconcile always walks the whole topic so edits and deletions anywhere are found.
      let cursor = options.mode === "reconcile" ? null : checkpoint?.cursor ?? null;
      if (cursor !== null) walkedEverything = false;
      const cursors = new Set<string | null>();
      while (seen < maximumMaterials) {
        options.signal.throwIfAborted();
        if (cursors.has(cursor)) throw new Error("RepeatedCursor");
        cursors.add(cursor);
        const page = await options.adapter.listHistory({
          chatId: options.chatId, topicId: topic.topicId!, cursor, limit: pageSize, signal: options.signal,
        });
        for (const post of page.posts) {
          if (seen >= maximumMaterials) break;
          seen += 1;
          for (const id of post.constituentMessageIds.length ? post.constituentMessageIds : [post.messageId]) seenMessageIds.add(id);
          if (!(await syncPost(context, post, topic))) failed = true;
        }
        cursor = page.nextCursor;
        const complete = cursor === null;
        await options.target.saveCheckpoint({
          chatId: options.chatId, topicId: topic.topicId!, cursor, complete, dryRun,
        });
        if (complete || seen >= maximumMaterials) break;
      }
      if (seen >= maximumMaterials) { walkedEverything = false; break; }
    }
    // Posts deleted while sync was offline: stored publicly but absent from a complete walk.
    if (options.mode === "reconcile" && walkedEverything && !failed && options.target.listStoredMessageIds && options.target.markDeleted) {
      const missing = (await options.target.listStoredMessageIds(options.chatId)).filter((id) => !seenMessageIds.has(id));
      if (missing.length > 0) await options.target.markDeleted({ chatId: options.chatId, messageIds: missing, dryRun });
    }
    await options.target.recordAuthors?.({ chatId: options.chatId, authors: [...context.authors.values()], dryRun });
    await options.target.finishRun({ runId, status: failed ? "failed" : "complete", dryRun });
    return { runId, materialsSeen: seen, failed };
  } catch (error) {
    await options.target.finishRun({
      runId, status: options.signal.aborted ? "cancelled" : "failed", dryRun,
    });
    throw error;
  }
}

export type ChangeSyncOptions = {
  adapter: TelegramAdapter;
  target: CloudLibrarySyncTarget;
  chatId: string;
  changes: ContentChange[];
  signal: AbortSignal;
};

/** Applies a batch of live Telegram changes (new, edited, deleted messages) to the cloud library. */
export async function syncTelegramChanges(options: ChangeSyncOptions) {
  const changes = options.changes.filter((change) => change.chatId === options.chatId);
  const deleted = [...new Set(changes.filter((change) => change.kind === "deleted").flatMap((change) => change.messageIds))];
  const updated = [...new Set(changes.filter((change) => change.kind !== "deleted").flatMap((change) => change.messageIds))]
    .filter((id) => !deleted.includes(id));
  if (deleted.length === 0 && updated.length === 0) return { runId: null, synced: 0, failed: false };
  const runId = await options.target.beginRun({ chatId: options.chatId, mode: "incremental", dryRun: false });
  let failed = false;
  let synced = 0;
  try {
    const topics = (await options.adapter.listTopics({ refresh: true, signal: options.signal }))
      .filter((topic) => topic.chatId === options.chatId && !topic.isGeneral && topic.topicId !== null);
    await options.target.upsertSource({ chatId: options.chatId, topics, dryRun: false });
    const context: SyncContext = {
      adapter: options.adapter, target: options.target, chatId: options.chatId, runId, dryRun: false,
      policy: await loadPolicy(options.adapter, options.target, options.chatId, false, options.signal),
      authors: new Map(), signal: options.signal,
    };
    if (deleted.length > 0) await options.target.markDeleted?.({ chatId: options.chatId, messageIds: deleted, dryRun: false });
    const handled = new Set<number>();
    for (const messageId of updated) {
      options.signal.throwIfAborted();
      if (handled.has(messageId)) continue;
      const post = await options.adapter.getPost(options.chatId, messageId, options.signal);
      if (!post) continue;
      for (const id of post.constituentMessageIds) handled.add(id);
      const topic = topics.find((item) => item.topicId === (post.topicId ?? post.forumTopicId));
      // Messages outside a content topic (General, service messages) are not library material.
      if (!topic) continue;
      await options.target.upsertTopic(topic, false);
      if (!(await syncPost(context, post, topic))) failed = true;
      synced += 1;
    }
    await options.target.recordAuthors?.({ chatId: options.chatId, authors: [...context.authors.values()], dryRun: false });
    await options.target.finishRun({ runId, status: failed ? "failed" : "complete", dryRun: false });
    return { runId, synced, failed };
  } catch (error) {
    await options.target.finishRun({ runId, status: options.signal.aborted ? "cancelled" : "failed", dryRun: false });
    throw error;
  }
}
