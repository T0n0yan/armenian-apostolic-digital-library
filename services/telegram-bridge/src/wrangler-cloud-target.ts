import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { BridgeCategory, BridgeRichBlock } from "../../../shared/telegram-bridge-contract";
import {
  createSearchableTelegramDocument,
  normalizeTelegramSearchText,
  searchAliases,
} from "../../../shared/telegram-search";
import type { TelegramAdmin } from "./adapter";
import type {
  AuthorTally,
  CloudLibrarySyncTarget,
  PublisherPolicy,
  SyncCheckpoint,
  SyncMaterial,
  SyncMediaUpload,
  SyncRunMode,
} from "./cloud-sync";
import { cloudMediaObjectKey } from "./cloud-sync";

// The same code serves staging and production; CLOUD_SYNC_ENV picks the D1 database and R2 bucket.
const CLOUD_ENV = process.env.CLOUD_SYNC_ENV === "production" ? "production" : "staging";
const DATABASE = `armenian-apostolic-digital-library-${CLOUD_ENV}`;
const BUCKET = `armenian-apostolic-library-media-${CLOUD_ENV}`;

function sql(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Unsafe numeric SQL value.");
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown) { return sql(JSON.stringify(value)); }

async function wrangler(args: string[], stdin?: AsyncIterable<Uint8Array>) {
  const child = spawn(process.execPath, [join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), ...args], {
    cwd: process.cwd(), stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"], env: process.env,
  });
  let stdout = "";
  let stderr = "";
  const output = child.stdout!;
  const errors = child.stderr!;
  const input = child.stdin;
  output.setEncoding("utf8");
  errors.setEncoding("utf8");
  output.on("data", (chunk: string) => { if (stdout.length < 2_000_000) stdout += chunk; });
  errors.on("data", (chunk: string) => { if (stderr.length < 32_000) stderr += chunk; });
  if (stdin) {
    if (!input) throw new Error("Wrangler stdin is unavailable.");
    try {
      for await (const chunk of stdin) {
        if (!input.write(chunk)) await once(input, "drain");
      }
      input.end();
    } catch (error) {
      input.destroy(error as Error);
      child.kill("SIGTERM");
      throw error;
    }
  }
  const [code] = await once(child, "exit") as [number | null];
  if (code !== 0) throw new Error(`Wrangler operation failed (${code}): ${stderr.replace(/\s+/gu, " ").slice(0, 500)}`);
  return stdout;
}

async function executeSql(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "telegram-cloud-sync-"));
  const file = join(directory, "operation.sql");
  try {
    await writeFile(file, contents, { mode: 0o600, flag: "wx" });
    return await wrangler(["d1", "execute", DATABASE, "--remote", "--env", CLOUD_ENV, "--file", file, "--yes"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function query<T>(command: string): Promise<T[]> {
  const output = await wrangler([
    "d1", "execute", DATABASE, "--remote", "--env", CLOUD_ENV, "--command", command, "--json",
  ]);
  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed.flatMap((item) => item.results ?? []);
}

function inlineText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const item = value as { text?: unknown; alt?: unknown; children?: unknown[] };
  return typeof item.text === "string" ? item.text
    : typeof item.alt === "string" ? item.alt
      : Array.isArray(item.children) ? item.children.map(inlineText).join("") : "";
}

function blockText(block: BridgeRichBlock): string {
  if ("content" in block) return block.content.map(inlineText).join("");
  if (block.type === "list") return block.items.flat().map(blockText).join("\n");
  if (block.type === "blockquote") return [...block.blocks.map(blockText), block.caption.map(inlineText).join("")].join("\n");
  if (block.type === "media") return block.caption.map(inlineText).join("");
  return "";
}

export function cloudMaterialSyncState(input: {
  deleted: boolean;
  metadataOnly: boolean;
  requiredMediaCount: number;
  readyMediaCount: number;
}) {
  if (input.deleted) return "deleted" as const;
  if (input.metadataOnly) return "pending_media" as const;
  return input.readyMediaCount === input.requiredMediaCount ? "ready" as const : "pending_media" as const;
}

type ExistingMaterial = { chat_id: string; message_id: number; content_hash: string; sync_state: string; author_id: string | null };
type ExistingMedia = { r2_key: string | null; thumbnail_r2_key: string | null };
type CursorRow = { chat_id: string; topic_id: number; cursor: string | null; phase: string };

export class WranglerCloudSyncTarget implements CloudLibrarySyncTarget {
  private readonly hashes = new Map<string, string>();
  private readonly published = new Map<string, string | null>();
  private readonly objectKeys = new Set<string>();
  private readonly checkpoints = new Map<string, SyncCheckpoint>();
  private readonly stagedMedia = new Map<string, Map<number, {
    original: string | null;
    thumbnail: string | null;
    sha256: string | null;
    originalUploaded: boolean;
  }>>();
  private pendingRun: { id: string; chatId: string; mode: SyncRunMode; dryRun: boolean } | null = null;

  private constructor(private readonly metadataOnly: boolean) {}

  static async create(options: { metadataOnly: boolean }) {
    const target = new WranglerCloudSyncTarget(options.metadataOnly);
    const [materials, media, cursors] = await Promise.all([
      query<ExistingMaterial>("SELECT chat_id,message_id,content_hash,sync_state,author_id FROM library_materials"),
      query<ExistingMedia>("SELECT r2_key,thumbnail_r2_key FROM library_media WHERE status='ready'"),
      query<CursorRow>("SELECT chat_id,topic_id,cursor,phase FROM library_sync_cursors"),
    ]);
    for (const row of materials) {
      target.hashes.set(`${row.chat_id}:${row.message_id}`, row.content_hash);
      if (row.sync_state === "ready") target.published.set(`${row.chat_id}:${row.message_id}`, row.author_id);
    }
    for (const row of media) for (const key of [row.r2_key, row.thumbnail_r2_key]) if (key) target.objectKeys.add(key);
    for (const row of cursors) target.checkpoints.set(`${row.chat_id}:${row.topic_id}`, { cursor: row.cursor, complete: row.phase === "complete" });
    return target;
  }

  async beginRun(input: { chatId: string; mode: SyncRunMode; dryRun: boolean }) {
    const id = randomUUID();
    this.pendingRun = { id, ...input };
    return id;
  }

  async upsertSource(input: { chatId: string; topics: BridgeCategory[]; dryRun: boolean }) {
    if (input.dryRun) return;
    if (!this.pendingRun || this.pendingRun.chatId !== input.chatId) throw new Error("Sync run/source mismatch.");
    const title = process.env.TELEGRAM_CONTENT_TITLE?.trim() || "Հայ Առաքելական Սուրբ Եկեղեցի";
    await executeSql(`INSERT INTO library_sources(chat_id,title,source_type,is_forum,status,updated_at)
VALUES(${sql(input.chatId)},${sql(title)},'supergroup',1,'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title,status='active',updated_at=excluded.updated_at;
INSERT INTO library_sync_runs(id,chat_id,mode,status,started_at)
VALUES(${sql(this.pendingRun.id)},${sql(input.chatId)},${sql(this.pendingRun.mode)},'running',strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
  }

  async upsertTopic(topic: BridgeCategory, dryRun: boolean) {
    if (dryRun || !topic.chatId || topic.topicId === null) return;
    await executeSql(`INSERT INTO library_topics
(id,chat_id,topic_id,slug,title,default_sort,status,icon_color,icon_emoji_id,is_general,telegram_message_count,last_synced_at,updated_at)
VALUES(${sql(topic.id)},${sql(topic.chatId)},${topic.topicId},${sql(topic.slug)},${sql(topic.name)},${sql(topic.defaultSort)},${sql(topic.status)},${sql(topic.iconColor)},${sql(topic.iconEmojiId)},${topic.isGeneral ? 1 : 0},${sql(topic.messageCount)},strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,default_sort=excluded.default_sort,status=excluded.status,
icon_color=excluded.icon_color,icon_emoji_id=excluded.icon_emoji_id,is_general=excluded.is_general,
telegram_message_count=excluded.telegram_message_count,last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at;`);
  }

  isCurrent(material: SyncMaterial) {
    const key = `${material.post.chatId}:${material.post.messageId}`;
    return !this.metadataOnly && !material.post.deleted
      && this.hashes.get(key) === material.contentHash
      && this.published.has(key) && this.published.get(key) === (material.post.authorId ?? null)
      && material.post.media.every((media) => this.objectKeys.has(cloudMediaObjectKey(material, media, false))
        && (!media.hasThumbnail || this.objectKeys.has(cloudMediaObjectKey(material, media, true))));
  }

  async getCheckpoint(chatId: string, topicId: number) { return this.checkpoints.get(`${chatId}:${topicId}`) ?? null; }

  async stageMaterial(material: SyncMaterial, dryRun: boolean) {
    const key = `${material.post.chatId}:${material.post.messageId}`;
    const unchanged = this.hashes.get(key) === material.contentHash;
    const mediaToUpload = dryRun || this.metadataOnly ? [] : material.post.media.flatMap((media) => {
      const result: Array<{ mediaIndex: number; thumbnail: boolean }> = [];
      const original = cloudMediaObjectKey(material, media, false);
      if (!unchanged || !this.objectKeys.has(original)) result.push({ mediaIndex: media.index, thumbnail: false });
      if (media.hasThumbnail) {
        const thumbnail = cloudMediaObjectKey(material, media, true);
        if (!unchanged || !this.objectKeys.has(thumbnail)) result.push({ mediaIndex: media.index, thumbnail: true });
      }
      return result;
    });
    const state = new Map<number, {
      original: string | null;
      thumbnail: string | null;
      sha256: string | null;
      originalUploaded: boolean;
    }>();
    for (const media of material.post.media) state.set(media.index, {
      original: this.objectKeys.has(cloudMediaObjectKey(material, media, false)) ? cloudMediaObjectKey(material, media, false) : null,
      thumbnail: media.hasThumbnail && this.objectKeys.has(cloudMediaObjectKey(material, media, true)) ? cloudMediaObjectKey(material, media, true) : null,
      sha256: null,
      originalUploaded: false,
    });
    this.stagedMedia.set(key, state);
    return { mediaToUpload };
  }

  async uploadMedia(media: SyncMediaUpload, dryRun: boolean) {
    if (dryRun || this.metadataOnly) return;
    const hash = createHash("sha256");
    async function* measured() { for await (const chunk of media.body) { hash.update(chunk); yield chunk; } }
    await wrangler([
      "r2", "object", "put", `${BUCKET}/${media.objectKey}`, "--remote", "--pipe", "--force",
      "--content-type", media.descriptor.mimeType ?? "application/octet-stream",
    ], measured());
    this.objectKeys.add(media.objectKey);
    const key = `${media.chatId}:${media.messageId}`;
    const item = this.stagedMedia.get(key)?.get(media.mediaIndex);
    if (!item) throw new Error("Media staging state missing.");
    if (media.thumbnail) item.thumbnail = media.objectKey;
    else { item.original = media.objectKey; item.sha256 = hash.digest("hex"); item.originalUploaded = true; }
  }

  async commitMaterial(material: SyncMaterial, dryRun: boolean) {
    if (dryRun) return;
    const post = material.post;
    const key = `${post.chatId}:${post.messageId}`;
    const mediaState = this.stagedMedia.get(key) ?? new Map();
    const blocks = post.richContent?.blocks ?? [];
    const state = cloudMaterialSyncState({
      deleted: post.deleted,
      metadataOnly: this.metadataOnly,
      requiredMediaCount: post.media.length,
      readyMediaCount: post.media.filter((media) => mediaState.get(media.index)?.original).length,
    });
    const resolvedMediaIndexes = [...mediaState.entries()].flatMap(([index, item]) => [
      ...(item.original ? [index] : []),
      ...(item.thumbnail ? [-(index + 1)] : []),
    ]);
    const resolveFailuresSql = state === "ready" ? `UPDATE library_sync_failures
SET status='resolved',resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId} AND status='pending'
AND (stage='material'${resolvedMediaIndexes.length > 0 ? ` OR (stage='media' AND media_index IN (${resolvedMediaIndexes.join(",")}))` : ""});` : "";
    const blockSql = blocks.map((block, ordinal) => `INSERT INTO library_material_blocks
(chat_id,message_id,block_id,ordinal,block_type,plain_text,structured_json)
VALUES(${sql(post.chatId)},${post.messageId},${sql(`block-${ordinal}`)},${ordinal},${sql(block.type)},${sql(blockText(block))},${json(block)});`).join("\n");
    const searchFields = createSearchableTelegramDocument({
      ...post,
      categoryId: material.topic.id,
      categoryName: material.topic.name,
      categorySlug: material.topic.slug,
    }, material.topic.name).fields;
    const searchSql = searchFields.map((field, ordinal) => {
      const fieldId = `${field.blockId ?? field.kind}-${ordinal}`;
      const normalized = normalizeTelegramSearchText(field.value);
      const aliases = searchAliases(field.value).join(" ");
      return `INSERT INTO library_search_documents
(chat_id,message_id,field_id,ordinal,field_kind,block_id,original_text,normalized_text,aliases_text,is_primary)
VALUES(${sql(post.chatId)},${post.messageId},${sql(fieldId)},${ordinal},${sql(field.kind)},${sql(field.blockId)},${sql(field.value)},${sql(normalized)},${sql(aliases)},${field.primary ? 1 : 0});
INSERT INTO library_search_fts(chat_id,message_id,field_id,normalized_text,aliases_text)
VALUES(${sql(post.chatId)},${post.messageId},${sql(fieldId)},${sql(normalized)},${sql(aliases)});`;
    }).join("\n");
    const mediaSql = post.media.map((media) => {
      const stored = mediaState.get(media.index);
      return `INSERT INTO library_media
(chat_id,message_id,media_index,source_message_id,kind,mime_type,file_name,size_bytes,width,height,duration,title,performer,waveform,alt_text,r2_key,thumbnail_r2_key,sha256,status,uploaded_at)
VALUES(${sql(post.chatId)},${post.messageId},${media.index},${post.constituentMessageIds[media.index] ?? post.messageId},${sql(media.kind)},${sql(media.mimeType)},${sql(media.fileName)},${sql(media.sizeBytes)},${sql(media.width)},${sql(media.height)},${sql(media.duration)},${sql(media.title)},${sql(media.performer)},${sql(media.waveform)},${sql(media.altText)},${sql(stored?.original)},${sql(stored?.thumbnail)},${sql(stored?.sha256)},${sql(stored?.original ? "ready" : "pending")},${stored?.original ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"});`;
    }).join("\n");
    const albumSql = post.constituentMessageIds.map((messageId, ordinal) => `INSERT INTO library_album_members(chat_id,canonical_message_id,member_message_id,ordinal)
VALUES(${sql(post.chatId)},${post.messageId},${messageId},${ordinal});`).join("\n");
    await executeSql(`PRAGMA foreign_keys=ON;
INSERT INTO library_materials
(chat_id,message_id,material_id,topic_key,topic_id,media_group_id,constituent_message_ids_json,content_type,title,telegram_url,content_text,caption_text,formatted_text_json,formatted_caption_json,rich_content_json,poll_json,location_json,unsupported_type,tags_json,number_value,date_value,published_at,edited_at,content_hash,source_revision,sync_state,deleted_at,synced_at,updated_at,author_id)
VALUES(${sql(post.chatId)},${post.messageId},${sql(post.id)},${sql(material.topic.id)},${sql(post.topicId)},${sql(post.mediaGroupId)},${json(post.constituentMessageIds)},${sql(post.contentType)},${sql(post.title)},${sql(post.telegramUrl)},${sql(post.contentText)},${sql(post.captionText)},${json(post.formattedText)},${json(post.formattedCaption)},${post.richContent ? json(post.richContent) : "NULL"},${post.poll ? json(post.poll) : "NULL"},${post.location ? json(post.location) : "NULL"},${sql(post.unsupportedType)},${json(post.tags)},${sql(post.numberValue)},${sql(post.dateValue)},${sql(post.publishedAt)},${sql(post.editedAt)},${sql(material.contentHash)},${sql(material.sourceRevision)},${sql(post.deleted ? "deleted" : "pending_media")},${post.deleted ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"},strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),${sql(post.authorId ?? null)})
ON CONFLICT(chat_id,message_id) DO UPDATE SET author_id=excluded.author_id, material_id=excluded.material_id,topic_key=excluded.topic_key,topic_id=excluded.topic_id,media_group_id=excluded.media_group_id,constituent_message_ids_json=excluded.constituent_message_ids_json,content_type=excluded.content_type,title=excluded.title,telegram_url=excluded.telegram_url,content_text=excluded.content_text,caption_text=excluded.caption_text,formatted_text_json=excluded.formatted_text_json,formatted_caption_json=excluded.formatted_caption_json,rich_content_json=excluded.rich_content_json,poll_json=excluded.poll_json,location_json=excluded.location_json,unsupported_type=excluded.unsupported_type,tags_json=excluded.tags_json,number_value=excluded.number_value,date_value=excluded.date_value,published_at=excluded.published_at,edited_at=excluded.edited_at,content_hash=excluded.content_hash,source_revision=excluded.source_revision,sync_state=excluded.sync_state,deleted_at=excluded.deleted_at,synced_at=excluded.synced_at,updated_at=excluded.updated_at;
DELETE FROM library_material_blocks WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId};
DELETE FROM library_search_fts WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId};
DELETE FROM library_search_documents WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId};
DELETE FROM library_album_members WHERE chat_id=${sql(post.chatId)} AND canonical_message_id=${post.messageId};
DELETE FROM library_media WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId};
${blockSql}\n${searchSql}\n${albumSql}\n${mediaSql}
UPDATE library_materials SET sync_state=${sql(state)},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE chat_id=${sql(post.chatId)} AND message_id=${post.messageId};
${resolveFailuresSql}
UPDATE library_sync_runs SET materials_seen=materials_seen+1,materials_written=materials_written+1,
media_seen=media_seen+${post.media.length},
media_uploaded=media_uploaded+${[...mediaState.values()].filter((item) => item.originalUploaded).length},
media_skipped=media_skipped+${[...mediaState.values()].filter((item) => item.original && !item.originalUploaded).length}
WHERE id=${sql(this.pendingRun?.id)};
`);
    this.hashes.set(key, material.contentHash);
    if (state === "ready") this.published.set(key, post.authorId ?? null);
    else this.published.delete(key);
    this.stagedMedia.delete(key);
  }

  async recordFailure(input: { runId: string; chatId: string; messageId: number; mediaIndex: number | null; stage: "material" | "media"; code: string; retryable: boolean; dryRun: boolean }) {
    if (input.dryRun) return;
    const sameMedia = input.mediaIndex === null ? "media_index IS NULL" : `media_index=${input.mediaIndex}`;
    await executeSql(`UPDATE library_sync_failures
SET status='resolved',resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE chat_id=${sql(input.chatId)} AND message_id=${input.messageId} AND ${sameMedia}
AND stage=${sql(input.stage)} AND status='pending';
INSERT INTO library_sync_failures(run_id,chat_id,message_id,media_index,stage,error_code,retryable,created_at)
VALUES(${sql(input.runId)},${sql(input.chatId)},${input.messageId},${sql(input.mediaIndex)},${sql(input.stage)},${sql(input.code)},${input.retryable ? 1 : 0},strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(run_id,chat_id,message_id,media_index,stage) DO UPDATE SET error_code=excluded.error_code,attempt_count=library_sync_failures.attempt_count+1;
UPDATE library_sync_runs SET failures=failures+1 WHERE id=${sql(input.runId)};`);
  }

  async saveCheckpoint(input: { chatId: string; topicId: number; cursor: string | null; complete: boolean; dryRun: boolean }) {
    if (input.dryRun) return;
    const complete = this.metadataOnly ? false : input.complete;
    const phase = this.metadataOnly ? "media" : complete ? "complete" : "history";
    await executeSql(`INSERT INTO library_sync_cursors(chat_id,topic_id,phase,cursor,updated_at)
VALUES(${sql(input.chatId)},${input.topicId},${sql(phase)},${sql(input.cursor)},strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(chat_id,topic_id) DO UPDATE SET phase=excluded.phase,cursor=excluded.cursor,updated_at=excluded.updated_at;`);
    this.checkpoints.set(`${input.chatId}:${input.topicId}`, { cursor: input.cursor, complete });
  }

  async finishRun(input: { runId: string; status: "complete" | "failed" | "cancelled"; dryRun: boolean }) {
    if (input.dryRun) return;
    await executeSql(`UPDATE library_sync_runs SET status=${sql(input.status)},completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${sql(input.runId)};`);
  }

  async syncPublishers(input: { chatId: string; admins: TelegramAdmin[] | null; dryRun: boolean }): Promise<PublisherPolicy> {
    if (input.admins && !input.dryRun) {
      // Mirror Telegram admins: add current ones, drop former ones (manual rows are left alone).
      const ids = input.admins.map((admin) => sql(admin.userId)).join(",");
      await executeSql(`${input.admins.map((admin) => `INSERT INTO library_publishers(chat_id,telegram_user_id,display_name,username,source,status,updated_at)
VALUES(${sql(input.chatId)},${sql(admin.userId)},${sql(admin.displayName)},${sql(admin.username)},'telegram_admin','allowed',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(chat_id,telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,
source=CASE WHEN library_publishers.source='manual' AND library_publishers.status='blocked' THEN 'manual' ELSE 'telegram_admin' END,
updated_at=excluded.updated_at;`).join("\n")}
DELETE FROM library_publishers WHERE chat_id=${sql(input.chatId)} AND source='telegram_admin'${ids ? ` AND telegram_user_id NOT IN (${ids})` : ""};`);
    }
    const rows = await query<{ telegram_user_id: string; status: string }>(
      `SELECT telegram_user_id,status FROM library_publishers WHERE chat_id=${sql(input.chatId)}`,
    );
    return {
      allowed: new Set(rows.filter((row) => row.status === "allowed").map((row) => row.telegram_user_id)),
      blocked: new Set(rows.filter((row) => row.status === "blocked").map((row) => row.telegram_user_id)),
    };
  }

  async recordAuthors(input: { chatId: string; authors: AuthorTally[]; dryRun: boolean }) {
    if (input.dryRun || input.authors.length === 0) return;
    await executeSql(input.authors.map((author) => `INSERT INTO library_post_authors(chat_id,telegram_user_id,display_name,post_count,withheld_count,last_post_at,updated_at)
VALUES(${sql(input.chatId)},${sql(author.userId)},${sql(author.displayName)},${author.posts},${author.withheld},${sql(author.lastPostAt)},strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(chat_id,telegram_user_id) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE library_post_authors.display_name END,
post_count=MAX(library_post_authors.post_count,excluded.post_count),withheld_count=excluded.withheld_count,
last_post_at=MAX(COALESCE(library_post_authors.last_post_at,''),COALESCE(excluded.last_post_at,'')),updated_at=excluded.updated_at;`).join("\n"));
  }

  async markDeleted(input: { chatId: string; messageIds: number[]; dryRun: boolean }) {
    const ids = input.messageIds.filter((id) => Number.isSafeInteger(id) && id > 0);
    if (input.dryRun || ids.length === 0) return;
    const list = ids.join(",");
    await executeSql(`UPDATE library_materials SET sync_state='deleted',deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE chat_id=${sql(input.chatId)} AND sync_state<>'deleted' AND (message_id IN (${list})
OR EXISTS (SELECT 1 FROM json_each(constituent_message_ids_json) WHERE CAST(value AS INTEGER) IN (${list})));`);
    for (const id of ids) this.published.delete(`${input.chatId}:${id}`);
  }

  /** Changes whenever the admin page allows or blocks someone; the watcher re-syncs on change. */
  async publishersVersion(chatId: string) {
    const rows = await query<{ version: string | null; count: number }>(
      `SELECT MAX(updated_at) AS version, COUNT(*) AS count FROM library_publishers WHERE chat_id=${sql(chatId)} AND source='manual'`,
    );
    return `${rows[0]?.version ?? ""}:${rows[0]?.count ?? 0}`;
  }

  async listStoredMessageIds(chatId: string) {
    const rows = await query<{ message_id: number }>(
      `SELECT message_id FROM library_materials WHERE chat_id=${sql(chatId)} AND sync_state<>'deleted'`,
    );
    return rows.map((row) => row.message_id);
  }
}

export async function cloudSyncStatus() {
  const [materials, media, failures, runs] = await Promise.all([
    query<{ sync_state: string; count: number }>("SELECT sync_state,COUNT(*) count FROM library_materials GROUP BY sync_state"),
    query<{ status: string; count: number; bytes: number }>("SELECT status,COUNT(*) count,COALESCE(SUM(size_bytes),0) bytes FROM library_media GROUP BY status"),
    query<{ count: number }>("SELECT COUNT(*) count FROM library_sync_failures WHERE status='pending'"),
    query<{ id: string; mode: string; status: string; started_at: string; completed_at: string | null }>("SELECT id,mode,status,started_at,completed_at FROM library_sync_runs ORDER BY started_at DESC LIMIT 5"),
  ]);
  return { materials, media, pendingFailures: failures[0]?.count ?? 0, runs };
}
