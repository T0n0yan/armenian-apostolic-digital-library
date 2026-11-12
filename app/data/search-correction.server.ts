import { buildSearchVocabulary, type SearchVocabulary } from "../../shared/search-correction";
import { listCloudLibraryCategories } from "./cloud-library.server";

// Բառարանը (վերնագրերի բառերը) պահվում է հիշողության մեջ 10 րոպե, որ ամեն որոնում չկարդա բազան։
const KEEP_MS = 10 * 60_000;
let cached: { at: number; vocabulary: Promise<SearchVocabulary> } | null = null;

export function searchVocabulary(database: D1Database) {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.vocabulary;
  const vocabulary = (async () => {
    const [categories, titles] = await Promise.all([
      listCloudLibraryCategories(database),
      database.prepare(
        `SELECT DISTINCT materials.title FROM library_materials AS materials
         INNER JOIN library_topics AS topics ON topics.id = materials.topic_key
         WHERE materials.sync_state = 'ready' AND materials.deleted_at IS NULL
           AND topics.is_general = 0 AND topics.status != 'hidden'
         ORDER BY materials.message_id DESC LIMIT 3000`,
      ).all<{ title: string }>(),
    ]);
    return buildSearchVocabulary([
      ...categories.filter((category) => !category.isGeneral && category.status !== "hidden").map((category) => category.name),
      ...titles.results.map((row) => row.title),
    ]);
  })();
  vocabulary.catch(() => { cached = null; });
  cached = { at: Date.now(), vocabulary };
  return vocabulary;
}
