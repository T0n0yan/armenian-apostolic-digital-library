import { env } from "cloudflare:workers";

import { quizResults, type QuizResult } from "./poll-votes.server";
import { listSavedMaterialIds } from "./saved-materials.server";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

export type CategoryPersonal = { savedMaterialIds: string[]; quizAnswers: Record<string, QuizResult>; canSave: boolean };

/** Ընթերցողի անձնականը բաժնի համար. պահված նյութերը և «Հարցեր Աստվածաշնչից»-ի պատասխանները։ */
export async function loadCategoryPersonal(category: { id: string; name: string }, user: { id: string } | null): Promise<CategoryPersonal> {
  if (!user) return { savedMaterialIds: [], quizAnswers: {}, canSave: false };
  const isQuestions = resolveContentCategoryId(category.id, category.name) === "category_bible_questions";
  const [savedMaterialIds, quizAnswers] = await Promise.all([
    listSavedMaterialIds(env.DB, user.id),
    // Which questions the reader already answered, and how.
    isQuestions ? quizResults(env.DB, user.id, category.id).catch(() => ({})) : Promise.resolve({}),
  ]);
  return { savedMaterialIds, quizAnswers: quizAnswers as Record<string, QuizResult>, canSave: true };
}
