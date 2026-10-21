import { listCloudLibraryCategories, listCloudLibraryCategoryPosts } from "./cloud-library.server";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { bridgePostToPublic } from "./materials.server";
import { psalmNumber } from "../utils/psalm-number";

export type PsalmLink = { id: string; number: number };
export type PsalmNeighbors = { number: number; previous: PsalmLink | null; next: PsalmLink | null };

/** The psalms just before and after this one, by psalm number, for "previous / next" links. */
export async function findPsalmNeighbors(database: D1Database, topicSlug: string, materialId: string): Promise<PsalmNeighbors | null> {
  const page = await listCloudLibraryCategoryPosts(database, topicSlug, null, 200);
  const psalms = page.posts
    .map((post) => { const material = bridgePostToPublic(post); return { id: material.id, number: psalmNumber(material) }; })
    .filter((item): item is PsalmLink => item.number !== null)
    .sort((left, right) => left.number - right.number);
  const index = psalms.findIndex((item) => item.id === materialId);
  if (index < 0) return null;
  return { number: psalms[index].number, previous: psalms[index - 1] ?? null, next: psalms[index + 1] ?? null };
}

/** The psalm with this number (/saghmosner/22), or null. */
export async function findPsalmByNumber(database: D1Database, number: number) {
  const topic = (await listCloudLibraryCategories(database)).find((category) => resolveContentCategoryId(category.id, category.name) === "category_psalms");
  if (!topic) return null;
  const page = await listCloudLibraryCategoryPosts(database, topic.slug, null, 200);
  for (const post of page.posts) {
    const material = bridgePostToPublic(post);
    if (psalmNumber(material) === number) return material.id;
  }
  return null;
}
