import {
  createSearchableTelegramDocument,
  locateStoredSearchHit,
  matchStoredSearchFields,
  messageIdSearchMatch,
  searchStem,
  parseTelegramSearchQuery,
  searchScoreRank,
  type SearchableTelegramDocument,
  type SearchableTelegramFieldKind,
  type StoredSearchField,
} from "../../shared/telegram-search";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { remember } from "./memory-cache.server";
import type {
  BridgeCategory,
  BridgeContentType,
  BridgeFormattedText,
  BridgeLocation,
  BridgeMedia,
  BridgePoll,
  BridgePost,
  BridgePostPage,
  BridgeRichContent,
} from "../../shared/telegram-bridge-contract";

type MaterialRow = {
  chat_id: string;
  message_id: number;
  material_id: string;
  topic_key: string;
  topic_id: number;
  media_group_id: string | null;
  constituent_message_ids_json: string;
  content_type: BridgeContentType;
  title: string;
  telegram_url: string;
  content_text: string;
  caption_text: string;
  formatted_text_json: string;
  formatted_caption_json: string;
  rich_content_json: string | null;
  poll_json: string | null;
  location_json: string | null;
  unsupported_type: string | null;
  tags_json: string;
  number_value: number | null;
  date_value: string | null;
  published_at: string | null;
  edited_at: string | null;
  topic_name: string;
  topic_slug: string;
};

type MediaRow = {
  chat_id: string;
  message_id: number;
  media_index: number;
  kind: BridgeMedia["kind"];
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  title: string | null;
  performer: string | null;
  waveform: string | null;
  alt_text: string;
  thumbnail_r2_key: string | null;
  r2_key?: string | null;
  r2_etag?: string | null;
  thumbnail_etag?: string | null;
};

/** A short stable tag for the stored file, so a replaced file gets a new URL. */
function mediaVersion(item: MediaRow) {
  const source = `${item.r2_etag ?? item.r2_key ?? ""}|${item.thumbnail_etag ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return source === "|" ? null : (hash >>> 0).toString(36);
}

type FeedCursor = { version: 1; scope: string; publishedAt: string; messageId: number };
type SearchCursor = { version: 1; scope: string; offset: number };

type SearchFieldRow = {
  chat_id: string;
  message_id: number;
  topic_id: number;
  media_group_id: string | null;
  constituent_message_ids_json: string;
  published_at: string | null;
  field_kind: SearchableTelegramFieldKind;
  block_id: string | null;
  field_id: string;
  normalized_text: string;
  aliases_text: string;
  is_primary: number;
};

export class CloudLibraryCursorError extends Error {
  constructor() { super("Invalid library cursor."); this.name = "CloudLibraryCursorError"; }
}

function json<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function encodeCursor(value: FeedCursor | SearchCursor) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function decodeCursor<T extends FeedCursor | SearchCursor>(value: string | null, scope: string): T | null {
  if (!value) return null;
  if (value.length > 2_000) throw new CloudLibraryCursorError();
  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<T>;
    if (parsed.version !== 1 || parsed.scope !== scope) throw new CloudLibraryCursorError();
    return parsed as T;
  } catch (error) {
    if (error instanceof CloudLibraryCursorError) throw error;
    throw new CloudLibraryCursorError();
  }
}

function materialSelect() {
  return `SELECT materials.chat_id, materials.message_id, materials.material_id,
      materials.topic_key, materials.topic_id, materials.media_group_id,
      materials.constituent_message_ids_json, materials.content_type,
      materials.title, materials.telegram_url, materials.content_text,
      materials.caption_text, materials.formatted_text_json,
      materials.formatted_caption_json, materials.rich_content_json,
      materials.poll_json, materials.location_json, materials.unsupported_type,
      materials.tags_json, materials.number_value, materials.date_value,
      materials.published_at, materials.edited_at,
      topics.title AS topic_name, topics.slug AS topic_slug
    FROM library_materials AS materials
    INNER JOIN library_topics AS topics ON topics.id = materials.topic_key`;
}

function searchMaterialSelect() {
  return `SELECT materials.chat_id, materials.message_id, materials.material_id,
      materials.topic_key, materials.topic_id, materials.media_group_id,
      materials.constituent_message_ids_json, materials.content_type,
      materials.title, materials.telegram_url, '' AS content_text,
      '' AS caption_text, '{"text":"","entities":[]}' AS formatted_text_json,
      '{"text":"","entities":[]}' AS formatted_caption_json,
      NULL AS rich_content_json, materials.poll_json, materials.location_json,
      materials.unsupported_type, materials.tags_json, materials.number_value,
      materials.date_value, materials.published_at, materials.edited_at,
      topics.title AS topic_name, topics.slug AS topic_slug
    FROM library_materials AS materials
    INNER JOIN library_topics AS topics ON topics.id = materials.topic_key`;
}

async function hydrateRows(database: D1Database, rows: MaterialRow[]) {
  if (rows.length === 0) return [];
  const mediaRows: MediaRow[] = [];
  // Each row binds 4 values (media and site attachments); D1 allows 100 per statement.
  const batchSize = 20;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const clauses = batch.map(() => "(chat_id = ? AND message_id = ?)").join(" OR ");
    const bindings = batch.flatMap((row) => [row.chat_id, row.message_id]);
    // Telegram's own media, then recordings added on the site (material_attachments).
    const media = await database.prepare(
      `SELECT chat_id, message_id, media_index, kind, mime_type, file_name,
         size_bytes, width, height, duration, title, performer, waveform,
         alt_text, thumbnail_r2_key, r2_key, r2_etag, thumbnail_etag
       FROM library_media WHERE status = 'ready' AND (${clauses})
       UNION ALL
       SELECT chat_id, message_id, media_index, kind, mime_type, file_name,
         size_bytes, NULL, NULL, duration, title, performer, NULL,
         '', NULL, r2_key, r2_etag, NULL
       FROM material_attachments WHERE (${clauses})
       ORDER BY chat_id, message_id, media_index`,
    ).bind(...bindings, ...bindings).all<MediaRow>();
    mediaRows.push(...media.results);
  }
  const byMaterial = new Map<string, BridgeMedia[]>();
  for (const item of mediaRows) {
    const key = `${item.chat_id}:${item.message_id}`;
    const values = byMaterial.get(key) ?? [];
    values.push({
      index: item.media_index,
      kind: item.kind,
      mimeType: item.mime_type,
      fileName: item.file_name,
      sizeBytes: item.size_bytes,
      width: item.width,
      height: item.height,
      duration: item.duration,
      title: item.title,
      performer: item.performer,
      waveform: item.waveform,
      hasThumbnail: Boolean(item.thumbnail_r2_key),
      altText: item.alt_text,
      version: mediaVersion(item),
      objectKey: item.r2_key,
      thumbnailObjectKey: item.thumbnail_r2_key,
    });
    byMaterial.set(key, values);
  }
  return rows.map((row): BridgePost => ({
    id: row.material_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    constituentMessageIds: json<number[]>(row.constituent_message_ids_json, [row.message_id]),
    topicId: row.topic_id,
    forumTopicId: row.topic_id,
    mediaGroupId: row.media_group_id,
    title: row.title,
    telegramUrl: row.telegram_url,
    categoryId: row.topic_key,
    categoryName: row.topic_name,
    categorySlug: row.topic_slug,
    contentText: row.content_text,
    captionText: row.caption_text,
    formattedText: json<BridgeFormattedText>(row.formatted_text_json, { text: row.content_text, entities: [] }),
    formattedCaption: json<BridgeFormattedText>(row.formatted_caption_json, { text: row.caption_text, entities: [] }),
    richContent: json<BridgeRichContent | null>(row.rich_content_json, null),
    contentType: row.content_type,
    poll: json<BridgePoll | null>(row.poll_json, null),
    location: json<BridgeLocation | null>(row.location_json, null),
    unsupportedType: row.unsupported_type,
    tags: json<string[]>(row.tags_json, []),
    publishedAt: row.published_at,
    editedAt: row.edited_at,
    dateValue: row.date_value,
    numberValue: row.number_value,
    media: byMaterial.get(`${row.chat_id}:${row.message_id}`) ?? [],
    deleted: false,
  }));
}

async function searchFieldOriginals(database: D1Database, fields: Array<{ chatId: string; messageId: number; fieldId: string }>) {
  const originals = new Map<string, string>();
  if (!fields.length) return originals;
  const clauses = fields.map(() => "(chat_id = ? AND message_id = ? AND field_id = ?)").join(" OR ");
  const result = await database.prepare(`SELECT chat_id, message_id, field_id, original_text FROM library_search_documents WHERE ${clauses}`)
    .bind(...fields.flatMap((field) => [field.chatId, field.messageId, field.fieldId]))
    .all<{ chat_id: string; message_id: number; field_id: string; original_text: string }>();
  for (const row of result.results) originals.set(`${row.chat_id}:${row.message_id}:${row.field_id}`, row.original_text);
  return originals;
}

async function materialRowsByIdentity(database: D1Database, identities: Array<{ chatId: string; messageId: number }>) {
  const rows: MaterialRow[] = [];
  const batchSize = 40;
  for (let offset = 0; offset < identities.length; offset += batchSize) {
    const batch = identities.slice(offset, offset + batchSize);
    const clauses = batch.map(() => "(materials.chat_id = ? AND materials.message_id = ?)").join(" OR ");
    const bindings = batch.flatMap((identity) => [identity.chatId, identity.messageId]);
    const result = await database.prepare(
      `${searchMaterialSelect()} WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL AND (${clauses})`,
    ).bind(...bindings).all<MaterialRow>();
    rows.push(...result.results);
  }
  return rows;
}

function ftsCandidateExpression(values: string[]) {
  const terms = new Set<string>();
  for (const value of values) {
    for (const token of value.split(/\s+/u).filter(Boolean)) {
      const characters = Array.from(token);
      if (characters.length < 2 || !/^[\p{L}\p{N}]+$/u.test(token)) continue;
      terms.add(`${token}*`);
      // Other endings of the word ("խաղաղություն" finds "խաղաղության").
      if (characters.length >= 4) terms.add(`${searchStem(token)}*`);
      if (terms.size >= 24) break;
    }
    if (terms.size >= 24) break;
  }
  return [...terms].join(" OR ");
}

// Topics whose oldest post is an introduction shown above their materials (category.tsx).
export const INTRO_TOPICS = new Set(["category_psalms", "category_saints_lives", "category_prayers", "category_bible_questions"]);

const MINUTE = 60_000;

/** The sections with their counts; read on almost every page, so kept in memory for a minute. */
export function listCloudLibraryCategories(database: D1Database): Promise<BridgeCategory[]> {
  return remember(database, "categories", MINUTE, () => loadCloudLibraryCategories(database));
}

async function loadCloudLibraryCategories(database: D1Database): Promise<BridgeCategory[]> {
  const rows = await database.prepare(
    `SELECT topics.id, topics.slug, topics.title, topics.default_sort,
       topics.chat_id, topics.topic_id, topics.status, topics.icon_color,
       topics.icon_emoji_id, topics.is_general, topics.telegram_message_count,
       COUNT(materials.message_id) AS material_count,
       (SELECT first.content_type FROM library_materials AS first
         WHERE first.topic_key = topics.id AND first.sync_state = 'ready' AND first.deleted_at IS NULL
         ORDER BY first.message_id LIMIT 1) AS first_content_type
     FROM library_topics AS topics
     LEFT JOIN library_materials AS materials
       ON materials.topic_key = topics.id AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
     GROUP BY topics.id
     ORDER BY topics.display_order, topics.topic_id`,
  ).all<{
    id: string; slug: string; title: string; default_sort: BridgeCategory["defaultSort"];
    chat_id: string; topic_id: number; status: BridgeCategory["status"];
    icon_color: number | null; icon_emoji_id: string | null; is_general: number;
    telegram_message_count: number | null; material_count: number; first_content_type: string | null;
  }>();
  return rows.results.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.title,
    defaultSort: row.default_sort,
    // A topic's introduction (its first, text-only post) is shown as its header, not counted.
    materialCount: row.material_count - (row.first_content_type === "text" && INTRO_TOPICS.has(resolveContentCategoryId(row.id, row.title) ?? "") ? 1 : 0),
    messageCount: row.telegram_message_count,
    chatId: row.chat_id,
    topicId: row.topic_id,
    status: row.status,
    iconColor: row.icon_color,
    iconEmojiId: row.icon_emoji_id,
    isGeneral: Boolean(row.is_general),
  }));
}

export function listCloudLibraryCategoryPosts(
  database: D1Database,
  slug: string,
  cursor: string | null,
  limit = 12,
  order: "asc" | "desc" = "desc",
): Promise<BridgePostPage> {
  return remember(database, `feed:${slug}:${cursor ?? ""}:${limit}:${order}`, MINUTE, () => loadCloudLibraryCategoryPosts(database, slug, cursor, limit, order));
}

async function loadCloudLibraryCategoryPosts(
  database: D1Database,
  slug: string,
  cursor: string | null,
  limit: number,
  order: "asc" | "desc",
): Promise<BridgePostPage> {
  // Up to 200 so a numbered topic like Psalms (151) can load in one page for its grid.
  const safeLimit = Math.min(200, Math.max(1, limit));
  const topic = await database.prepare("SELECT id FROM library_topics WHERE slug = ? AND is_general = 0 AND status != 'hidden'")
    .bind(slug).first<{ id: string }>();
  if (!topic) return { posts: [], nextCursor: null, total: 0 };
  const scope = `feed:${topic.id}:${order}`;
  const position = decodeCursor<FeedCursor>(cursor, scope);
  const comparison = order === "asc" ? ">" : "<";
  const cursorClause = position
    ? `AND (COALESCE(materials.published_at, '') ${comparison} ? OR (COALESCE(materials.published_at, '') = ? AND materials.message_id ${comparison} ?))`
    : "";
  const direction = order === "asc" ? "ASC" : "DESC";
  const bindings: unknown[] = [topic.id];
  if (position) bindings.push(position.publishedAt, position.publishedAt, position.messageId);
  bindings.push(safeLimit + 1);
  const result = await database.prepare(
    `${materialSelect()}
     WHERE materials.topic_key = ? AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
     ${cursorClause}
     ORDER BY COALESCE(materials.published_at, '') ${direction}, materials.message_id ${direction}
     LIMIT ?`,
  ).bind(...bindings).all<MaterialRow>();
  const hasMore = result.results.length > safeLimit;
  const rows = result.results.slice(0, safeLimit);
  const posts = await hydrateRows(database, rows);
  const last = rows.at(-1);
  const total = await database.prepare(
    "SELECT COUNT(*) AS count FROM library_materials WHERE topic_key = ? AND sync_state = 'ready' AND deleted_at IS NULL",
  ).bind(topic.id).first<{ count: number }>();
  return {
    posts,
    total: total?.count ?? posts.length,
    nextCursor: hasMore && last ? encodeCursor({
      version: 1, scope, publishedAt: last.published_at ?? "", messageId: last.message_id,
    }) : null,
  };
}

export function getCloudLibraryPost(database: D1Database, chatId: string, messageId: number) {
  return remember(database, `post:${chatId}:${messageId}`, MINUTE, () => loadCloudLibraryPost(database, chatId, messageId));
}

async function loadCloudLibraryPost(database: D1Database, chatId: string, messageId: number) {
  const row = await database.prepare(
    `${materialSelect()}
     WHERE materials.chat_id = ? AND materials.message_id = ?
       AND materials.sync_state = 'ready' AND materials.deleted_at IS NULL
       AND topics.is_general = 0 AND topics.status != 'hidden'`,
  ).bind(chatId, messageId).first<MaterialRow>();
  return row ? (await hydrateRows(database, [row]))[0] ?? null : null;
}

export function searchCloudLibraryPosts(
  database: D1Database,
  query: string,
  categoryId: string,
  cursor: string | null,
  limit = 20,
): Promise<BridgePostPage> {
  // The same search (popular words, typing the same prefix) is answered from memory for a minute.
  return remember(database, `search:${query.trim().toLocaleLowerCase("hy")}:${categoryId}:${cursor ?? ""}:${limit}`, MINUTE, () => loadSearchCloudLibraryPosts(database, query, categoryId, cursor, limit));
}

async function loadSearchCloudLibraryPosts(
  database: D1Database,
  query: string,
  categoryId: string,
  cursor: string | null,
  limit: number,
): Promise<BridgePostPage> {
  const parsed = parseTelegramSearchQuery(query);
  if (!parsed.normalized && !parsed.messageIdIntent) {
    if (!categoryId) return { posts: [], nextCursor: null, total: 0 };
    const topic = await database.prepare("SELECT slug FROM library_topics WHERE id = ? AND is_general = 0 AND status != 'hidden'")
      .bind(categoryId).first<{ slug: string }>();
    return topic ? listCloudLibraryCategoryPosts(database, topic.slug, cursor, 12) : { posts: [], nextCursor: null, total: 0 };
  }
  const safeLimit = Math.min(20, Math.max(1, limit));
  const scope = `search:${parsed.normalized}:${parsed.messageIdIntent?.messageId ?? ""}:${categoryId}`;
  const position = decodeCursor<SearchCursor>(cursor, scope);
  if (position && (!Number.isSafeInteger(position.offset) || position.offset < 0 || position.offset > 50_000)) {
    throw new CloudLibraryCursorError();
  }
  const categoryClause = categoryId ? "AND materials.topic_key = ?" : "";
  const intendedMessageId = parsed.messageIdIntent?.messageId;
  if (intendedMessageId) {
    const bindings: unknown[] = [intendedMessageId, intendedMessageId];
    if (categoryId) bindings.push(categoryId);
    const result = await database.prepare(
      `${materialSelect()}
       WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
         AND topics.is_general = 0 AND topics.status != 'hidden'
         AND (materials.message_id = ? OR EXISTS (
           SELECT 1 FROM json_each(materials.constituent_message_ids_json) WHERE CAST(value AS INTEGER) = ?
         )) ${categoryClause}
       ORDER BY COALESCE(materials.published_at, '') DESC, materials.message_id DESC LIMIT 2`,
    ).bind(...bindings).all<MaterialRow>();
    const posts = await hydrateRows(database, result.results);
    const page = posts.map((post) => ({ ...post, searchMatch: messageIdSearchMatch(intendedMessageId) }));
    return { posts: page, total: page.length, nextCursor: null };
  }

  // The index and the query are both folded across classical and reformed spelling. FTS finds and
  // orders the candidates (bm25) inside D1, whose time isn't the Worker's CPU; the Worker only
  // ranks the best few with the stored normalized text, without normalizing anything again.
  const candidateValues = [parsed.normalized, ...parsed.tokens, ...parsed.aliases];
  const ftsExpression = ftsCandidateExpression(candidateValues);
  if (!ftsExpression) return { posts: [], total: 0, nextCursor: null };
  const ftsBindings: unknown[] = [ftsExpression];
  if (categoryId) ftsBindings.push(categoryId);
  const ftsFields = await database.prepare(
    `WITH matched AS (
       SELECT library_search_fts.chat_id, CAST(library_search_fts.message_id AS INTEGER) AS message_id,
         library_search_fts.field_id, bm25(library_search_fts) AS score
       FROM library_search_fts WHERE library_search_fts MATCH ?
       ORDER BY score LIMIT ${categoryId ? 1500 : 400}
     ), ranked_candidates AS (
       SELECT documents.chat_id,documents.message_id,materials.topic_id,materials.media_group_id,
         materials.constituent_message_ids_json,materials.published_at,documents.field_kind,
         documents.block_id,documents.field_id,documents.normalized_text,documents.aliases_text,documents.is_primary,
         matched.score,
         ROW_NUMBER() OVER (
           PARTITION BY documents.chat_id,documents.message_id
           ORDER BY documents.is_primary DESC,matched.score
         ) AS candidate_rank
       FROM matched
       INNER JOIN library_search_documents AS documents
         ON documents.chat_id=matched.chat_id AND documents.message_id=matched.message_id
         AND documents.field_id=matched.field_id
       INNER JOIN library_materials AS materials
         ON materials.chat_id=documents.chat_id AND materials.message_id=documents.message_id
       INNER JOIN library_topics AS topics ON topics.id=materials.topic_key
       WHERE materials.sync_state='ready' AND materials.deleted_at IS NULL
         AND topics.is_general=0 AND topics.status!='hidden' ${categoryClause}
     )
     SELECT chat_id,message_id,topic_id,media_group_id,constituent_message_ids_json,
       published_at,field_kind,block_id,field_id,normalized_text,aliases_text,is_primary
     FROM ranked_candidates WHERE candidate_rank <= 2
     ORDER BY score
     LIMIT 120`,
  ).bind(...ftsBindings).all<SearchFieldRow>();
  const documents = new Map<string, SearchableTelegramDocument & { publishedAt: string | null; stored: StoredSearchField[]; fieldIds: string[] }>();
  for (const field of ftsFields.results) {
    const key = `${field.chat_id}:${field.message_id}`;
    const document = documents.get(key) ?? {
      chatId: field.chat_id,
      messageId: field.message_id,
      topicId: field.topic_id,
      mediaGroupId: field.media_group_id,
      constituentMessageIds: json<number[]>(field.constituent_message_ids_json, [field.message_id]),
      fields: [],
      stored: [],
      fieldIds: [],
      publishedAt: field.published_at,
    };
    document.stored.push({
      kind: field.field_kind,
      normalized: field.normalized_text,
      aliases: field.aliases_text,
      primary: Boolean(field.is_primary),
      blockId: field.block_id,
    });
    document.fieldIds.push(field.field_id);
    documents.set(key, document);
  }
  // Psalms that match equally well read in their own order (1, 2, 3…), not by when they were posted.
  // The number comes from the audio title ("Սաղմոս 42") or the text ("(Սաղմոս 42)").
  type Candidate = SearchableTelegramDocument & { stored: StoredSearchField[] };
  const psalmNumbers = new Map<Candidate, number | null>();
  const psalmNumberOf = (document: Candidate) => {
    if (psalmNumbers.has(document)) return psalmNumbers.get(document) ?? null;
    psalmNumbers.set(document, findPsalmNumber(document));
    return psalmNumbers.get(document) ?? null;
  };
  const findPsalmNumber = (document: Candidate) => {
    for (const field of [...document.stored].sort((a, b) => Number(b.primary) - Number(a.primary))) {
      const found = /սաղմոս\S*\s*(\d{1,3})(?!\d)/iu.exec(field.normalized);
      if (found) return Number(found[1]);
    }
    return null;
  };
  const psalmOrder = (left: Candidate, right: Candidate) => {
    if (left.topicId !== right.topicId) return 0;
    const a = psalmNumberOf(left), b = psalmNumberOf(right);
    return a !== null && b !== null ? a - b : 0;
  };
  const matches = [...documents.values()].flatMap((document) => {
    const match = matchStoredSearchFields(document.stored, parsed);
    return match ? [{ document, match, rank: match.rank }] : [];
  }).sort((left, right) =>
    right.rank - left.rank ||
    psalmOrder(left.document, right.document) ||
    (right.match.strength ?? 0) - (left.match.strength ?? 0) ||
    (right.document.publishedAt ?? "").localeCompare(left.document.publishedAt ?? "") ||
    right.document.messageId - left.document.messageId,
  );
  const offset = position?.offset ?? 0;
  const selected = matches.slice(offset, offset + safeLimit);
  const selectedRows = await materialRowsByIdentity(database, selected.map(({ document }) => ({
    chatId: document.chatId, messageId: document.messageId,
  })));
  const postByIdentity = new Map((await hydrateRows(database, selectedRows)).map((post) => [`${post.chatId}:${post.messageId}`, post]));
  // The highlight needs the shown text: read only the matched field of the materials on this page.
  const originals = await searchFieldOriginals(database, selected.map(({ document, match }) => ({
    chatId: document.chatId, messageId: document.messageId, fieldId: document.fieldIds[match.fieldIndex],
  })));
  const page = selected.flatMap(({ document, match }) => {
    const post = postByIdentity.get(`${document.chatId}:${document.messageId}`);
    if (!post) return [];
    const original = originals.get(`${document.chatId}:${document.messageId}:${document.fieldIds[match.fieldIndex]}`);
    const hit = original ? locateStoredSearchHit(original, document.stored[match.fieldIndex], parsed, match) : undefined;
    const { fieldIndex: _field, normalizedStart: _start, normalizedLength: _length, ...searchMatch } = match;
    return [{ ...post, searchMatch: { ...searchMatch, hit } }];
  });
  const nextOffset = offset + selected.length;
  return {
    posts: page,
    total: matches.length,
    nextCursor: nextOffset < matches.length ? encodeCursor({ version: 1, scope, offset: nextOffset }) : null,
  };
}

export function cloudSearchScoreRank(value: Parameters<typeof searchScoreRank>[0]) {
  return searchScoreRank(value);
}
