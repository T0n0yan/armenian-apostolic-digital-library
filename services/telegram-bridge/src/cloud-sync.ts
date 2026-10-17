import type { BridgeCategory, BridgeMedia } from "../../../shared/telegram-bridge-contract";
import type { TelegramAdapter, TelegramPost } from "./adapter";

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
  stageMaterial(material: SyncMaterial, dryRun: boolean): Promise<{ mediaIndexesToUpload: number[] }>;
  uploadMedia(media: SyncMediaUpload, dryRun: boolean): Promise<void>;
  commitMaterial(material: SyncMaterial, dryRun: boolean): Promise<void>;
  recordFailure(input: {
    runId: string; chatId: string; messageId: number; mediaIndex: number | null;
    stage: "material" | "media"; code: string; retryable: boolean; dryRun: boolean;
  }): Promise<void>;
  saveCheckpoint(input: { chatId: string; topicId: number; cursor: string | null; complete: boolean; dryRun: boolean }): Promise<void>;
  finishRun(input: { runId: string; status: "complete" | "failed" | "cancelled"; dryRun: boolean }): Promise<void>;
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

export function cloudMediaObjectKey(material: Pick<SyncMaterial, "post" | "contentHash">, media: BridgeMedia) {
  return `v1/${material.post.chatId}/${material.post.messageId}/${material.contentHash}/${media.index}/original.${safeExtension(media)}`;
}

function failureCode(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "aborted";
  return error instanceof Error && /^[a-z0-9_-]{1,64}$/iu.test(error.name) ? error.name.toLowerCase() : "sync-failed";
}

export async function syncTelegramLibrary(options: CloudSyncOptions) {
  const dryRun = options.dryRun ?? options.mode === "dry-run";
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const maximumMaterials = Math.min(100_000, Math.max(1, options.maximumMaterials ?? 10_000));
  const runId = await options.target.beginRun({ chatId: options.chatId, mode: options.mode, dryRun });
  let seen = 0;
  let failed = false;
  try {
    options.signal.throwIfAborted();
    const topics = (await options.adapter.listTopics({ refresh: true, signal: options.signal }))
      .filter((topic) => topic.chatId === options.chatId && !topic.isGeneral && topic.topicId !== null);
    await options.target.upsertSource({ chatId: options.chatId, topics, dryRun });
    for (const topic of topics) {
      options.signal.throwIfAborted();
      await options.target.upsertTopic(topic, dryRun);
      const checkpoint = await options.target.getCheckpoint(options.chatId, topic.topicId!);
      if (checkpoint?.complete && options.mode === "historical") continue;
      let cursor = checkpoint?.cursor ?? null;
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
          const contentHash = await telegramMaterialContentHash(post);
          const material: SyncMaterial = {
            post, topic, contentHash,
            sourceRevision: post.editedAt ?? post.publishedAt ?? `${post.messageId}`,
          };
          try {
            const staged = await options.target.stageMaterial(material, dryRun);
            for (const mediaIndex of staged.mediaIndexesToUpload) {
              const descriptor = await options.adapter.getMediaDescriptor(
                post.chatId, post.messageId, mediaIndex, options.signal,
              );
              if (!descriptor) throw new Error("MediaUnavailable");
              if (descriptor.sizeBytes === null || descriptor.sizeBytes <= 0) throw new Error("MediaSizeUnavailable");
              const end = descriptor.sizeBytes - 1;
              await options.target.uploadMedia({
                chatId: post.chatId,
                messageId: post.messageId,
                mediaIndex,
                objectKey: cloudMediaObjectKey(material, descriptor),
                descriptor,
                body: options.adapter.streamMedia({
                  chatId: post.chatId, messageId: post.messageId, mediaIndex,
                  start: 0, end, signal: options.signal,
                }),
              }, dryRun);
            }
            await options.target.commitMaterial(material, dryRun);
          } catch (error) {
            if (options.signal.aborted) throw error;
            failed = true;
            await options.target.recordFailure({
              runId, chatId: post.chatId, messageId: post.messageId, mediaIndex: null,
              stage: "material", code: failureCode(error), retryable: true, dryRun,
            });
          }
        }
        cursor = page.nextCursor;
        const complete = cursor === null;
        await options.target.saveCheckpoint({
          chatId: options.chatId, topicId: topic.topicId!, cursor, complete, dryRun,
        });
        if (complete || seen >= maximumMaterials) break;
      }
      if (seen >= maximumMaterials) break;
    }
    await options.target.finishRun({ runId, status: failed ? "failed" : "complete", dryRun });
    return { runId, materialsSeen: seen, failed };
  } catch (error) {
    await options.target.finishRun({
      runId, status: options.signal.aborted ? "cancelled" : "failed", dryRun,
    });
    throw error;
  }
}
