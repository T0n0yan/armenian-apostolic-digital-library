import { createMaterialId, parseMaterialId, type BridgeContentType, type BridgeSearchHit } from "../../shared/telegram-bridge-contract";
import { normalizeSearchText } from "./material-content.server";
import { bridgePostToCardPreview, createMaterialExcerpt, type MaterialCardPreview } from "./materials.server";
import { createSearchExcerpt } from "./search-materials.server";
import type { ResolvedSearchQuery } from "./search-query.server";
import { getCloudLibraryPost } from "./cloud-library.server";
import { matchSearchableText, type RankedTelegramSearchMatch } from "../../shared/telegram-search";

export type SavedMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
  personalNote: string;
  savedAt: string;
  excerpt: string | null;
  contentType: BridgeContentType;
  preview: MaterialCardPreview;
  unavailable?: boolean;
  noteSearchMatch?: RankedTelegramSearchMatch;
  searchHit?: BridgeSearchHit;
};

export type SavedMaterialGroup = {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  materials: SavedMaterial[];
};

type SavedReferenceRow = {
  chat_id: string;
  message_id: number;
  personal_note: string;
  personal_note_search: string;
  saved_at: string;
};

export async function listSavedMaterialIds(database: D1Database, userId: string) {
  const { results } = await database
    .prepare("SELECT chat_id, message_id FROM saved_materials WHERE user_id = ?")
    .bind(userId)
    .all<{ chat_id: string; message_id: number }>();
  return results.map((row) => createMaterialId(row.chat_id, row.message_id));
}

function unavailableTelegramUrl(chatId: string, messageId: number) {
  return `https://t.me/c/${chatId.replace(/^-100/u, "").replace(/^-/, "")}/${messageId}`;
}

export async function listSavedMaterials(
  database: D1Database,
  userId: string,
  query = "",
  resolvedQuery?: ResolvedSearchQuery,
  signal?: AbortSignal,
): Promise<SavedMaterial[]> {
  const { results } = await database.prepare(
    `SELECT chat_id, message_id, personal_note, personal_note_search, saved_at
     FROM saved_materials WHERE user_id = ? ORDER BY saved_at DESC LIMIT 500`,
  ).bind(userId).all<SavedReferenceRow>();
  const normalizedQuery = resolvedQuery?.highlightQuery || normalizeSearchText(query);
  return hydrateSavedReferences(database, results, normalizedQuery, signal, false);
}

export async function searchSavedMaterialNotes(
  database: D1Database,
  userId: string,
  resolvedQuery: ResolvedSearchQuery,
  signal?: AbortSignal,
): Promise<SavedMaterial[]> {
  if (Array.from(resolvedQuery.normalized).length < 2) return [];
  const { results } = await database.prepare(
    `SELECT chat_id, message_id, personal_note, personal_note_search, saved_at
     FROM saved_materials
     WHERE user_id = ?
     ORDER BY saved_at DESC LIMIT 500`,
  ).bind(userId).all<SavedReferenceRow>();
  const matches = new Map<string, RankedTelegramSearchMatch>();
  const matchingRows = results.filter((row) => {
    const match = matchSearchableText(row.personal_note, resolvedQuery);
    if (!match) return false;
    matches.set(`${row.chat_id}:${row.message_id}`, match);
    return true;
  });
  return hydrateSavedReferences(database, matchingRows, resolvedQuery.normalized, signal, true, matches);
}

async function hydrateSavedReferences(
  database: D1Database,
  results: SavedReferenceRow[],
  normalizedQuery: string,
  signal: AbortSignal | undefined,
  notesOnly: boolean,
  noteMatches: ReadonlyMap<string, RankedTelegramSearchMatch> = new Map(),
) {
  const hydrated: Array<SavedMaterial | null> = new Array(results.length).fill(null);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(4, results.length) }, async () => {
    while (nextIndex < results.length) {
      const index = nextIndex;
      nextIndex += 1;
      signal?.throwIfAborted();
      const row = results[index];
      const post = await getCloudLibraryPost(database, row.chat_id, row.message_id);
      if (!post?.categoryId || !post.categoryName || !post.categorySlug) {
        const title = "Հրապարակումն այլևս հասանելի չէ";
        const searchable = notesOnly ? row.personal_note : `${title} ${row.personal_note}`;
        if (normalizedQuery && !normalizeSearchText(searchable).includes(normalizedQuery)) continue;
        const noteMatch = noteMatches.get(`${row.chat_id}:${row.message_id}`);
        hydrated[index] = {
        id: createMaterialId(row.chat_id, row.message_id),
        title,
        telegramUrl: unavailableTelegramUrl(row.chat_id, row.message_id),
        categoryId: "category_unavailable",
        categoryName: "Անհասանելի նյութեր",
        categorySlug: "unavailable",
        numberValue: null,
        dateValue: null,
        publishedAt: null,
        mediaTypes: [],
        personalNote: row.personal_note,
        savedAt: row.saved_at,
        excerpt: row.personal_note || "Telegram հրապարակումը ջնջված է կամ այլևս հասանելի չէ։",
        contentType: "unsupported",
        preview: {
          thumbnailUrl: null,
          imageUrl: null,
          width: null,
          height: null,
          mediaCount: 0,
          duration: null,
          mediaTitle: null,
          performer: null,
          pollQuestion: null,
          pollOptionCount: null,
          locationTitle: null,
          locationSummary: null,
          daily: null,
          unsupportedType: "unavailable",
        },
        unavailable: true,
        noteSearchMatch: noteMatch,
        searchHit: noteMatch?.hit ? { ...noteMatch.hit, source: "personal-note", blockId: null } : undefined,
        };
        continue;
      }
      const searchable = normalizeSearchText(notesOnly
        ? row.personal_note
        : `${post.title} ${post.contentText} ${post.captionText} ${post.tags.join(" ")} ${row.personal_note}`);
      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      const noteMatch = noteMatches.get(`${row.chat_id}:${row.message_id}`);
      hydrated[index] = {
      id: post.id,
      title: post.title,
      telegramUrl: post.telegramUrl,
      categoryId: post.categoryId,
      categoryName: post.categoryName,
      categorySlug: post.categorySlug,
      numberValue: post.numberValue,
      dateValue: post.dateValue,
      publishedAt: post.publishedAt,
      mediaTypes: [...new Set(post.media.map((asset) => asset.kind))],
      personalNote: row.personal_note,
      savedAt: row.saved_at,
      excerpt: normalizedQuery
        ? createSearchExcerpt(notesOnly
          ? row.personal_note
          : post.contentText || post.captionText || row.personal_note, normalizedQuery)
        : createMaterialExcerpt(post.contentText || post.captionText || row.personal_note),
      contentType: post.contentType,
      preview: bridgePostToCardPreview(post),
      noteSearchMatch: noteMatch,
      searchHit: noteMatch?.hit ? { ...noteMatch.hit, source: "personal-note", blockId: null } : undefined,
      };
    }
  });
  await Promise.all(workers);
  return hydrated.filter((item): item is SavedMaterial => item !== null);
}

export function groupSavedMaterials(materials: SavedMaterial[]): SavedMaterialGroup[] {
  const groups = new Map<string, SavedMaterialGroup>();
  for (const material of materials) {
    const existing = groups.get(material.categorySlug);
    if (existing) existing.materials.push(material);
    else groups.set(material.categorySlug, {
      categoryId: material.categoryId,
      categoryName: material.categoryName,
      categorySlug: material.categorySlug,
      materials: [material],
    });
  }
  return [...groups.values()];
}

export async function setMaterialSaved(
  database: D1Database,
  userId: string,
  materialId: string,
  saved: boolean,
  personalNote = "",
) {
  const reference = parseMaterialId(materialId);
  if (!reference) return false;
  if (saved) {
    const note = Array.from(personalNote.trim()).slice(0, 160).join("");
    const noteSearch = normalizeSearchText(note).slice(0, 200);
    await database.prepare(
      `INSERT INTO saved_materials (user_id, chat_id, message_id, personal_note, personal_note_search)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, chat_id, message_id) DO UPDATE SET
         personal_note = excluded.personal_note,
         personal_note_search = excluded.personal_note_search`,
    ).bind(userId, reference.chatId, reference.messageId, note, noteSearch).run();
    return true;
  }
  await database.prepare(
    "DELETE FROM saved_materials WHERE user_id = ? AND chat_id = ? AND message_id = ?",
  ).bind(userId, reference.chatId, reference.messageId).run();
  return false;
}
