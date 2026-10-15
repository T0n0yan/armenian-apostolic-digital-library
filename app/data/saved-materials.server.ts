import { createMaterialId, parseMaterialId } from "../../shared/telegram-bridge-contract";
import { normalizeSearchText } from "./material-content.server";
import { createSearchExcerpt } from "./search-materials.server";
import type { ResolvedSearchQuery } from "./search-query.server";
import { getBridgePost } from "./telegram-bridge.server";

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
  unavailable?: boolean;
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
): Promise<SavedMaterial[]> {
  const { results } = await database.prepare(
    `SELECT chat_id, message_id, personal_note, personal_note_search, saved_at
     FROM saved_materials WHERE user_id = ? ORDER BY saved_at DESC LIMIT 500`,
  ).bind(userId).all<SavedReferenceRow>();
  const normalizedQuery = resolvedQuery?.highlightQuery || normalizeSearchText(query);
  const hydrated = await Promise.all(results.map(async (row): Promise<SavedMaterial | null> => {
    const post = await getBridgePost(database, row.chat_id, row.message_id);
    if (!post?.categoryId || !post.categoryName || !post.categorySlug) {
      const title = "Հրապարակումն այլևս հասանելի չէ";
      if (normalizedQuery && !normalizeSearchText(`${title} ${row.personal_note}`).includes(normalizedQuery)) return null;
      return {
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
        unavailable: true,
      };
    }
    const searchable = normalizeSearchText(`${post.title} ${post.contentText} ${post.captionText} ${post.tags.join(" ")} ${row.personal_note}`);
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return null;
    return {
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
        ? createSearchExcerpt(post.contentText || post.captionText || row.personal_note, normalizedQuery)
        : null,
    };
  }));
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
