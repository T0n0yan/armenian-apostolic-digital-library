import type { GuideStatus } from "../utils/guides";
import { isQuestionTopic, missKey, type GuideQuestion } from "../utils/questions";

type Row = { id: number; topic: string; question: string; answer: string; status: string; sort: number };
const toQuestion = (row: Row): GuideQuestion => ({
  ...row,
  topic: isQuestionTopic(row.topic) ? row.topic : "faith",
  status: (["draft", "review", "published"].includes(row.status) ? row.status : "draft") as GuideStatus,
});

export async function listQuestions(db: D1Database, withDrafts = false) {
  const { results } = await db.prepare(`SELECT id, topic, question, answer, status, sort FROM guide_questions ${withDrafts ? "" : "WHERE status != 'draft'"} ORDER BY topic, sort, id`).all<Row>();
  return results.map(toQuestion);
}

export async function saveQuestion(db: D1Database, input: Omit<GuideQuestion, "id"> & { id?: number }, userId: string) {
  if (input.id) {
    await db.prepare("UPDATE guide_questions SET topic = ?, question = ?, answer = ?, status = ?, sort = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .bind(input.topic, input.question, input.answer, input.status, input.sort, userId, input.id).run();
  } else {
    await db.prepare("INSERT INTO guide_questions (topic, question, answer, status, sort, updated_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(input.topic, input.question, input.answer, input.status, input.sort, userId).run();
  }
}

export function deleteQuestion(db: D1Database, id: number) {
  return db.prepare("DELETE FROM guide_questions WHERE id = ?").bind(id).run();
}

/** Ոչինչ չգտած որոնում. միայն բառը, օրը և աղբյուրը (church/library)՝ առանց հաշվի կամ IP-ի։ */
export async function recordMiss(db: D1Database, query: string, source: "church" | "library") {
  const key = missKey(query);
  if (key.length < 2) return;
  await db.prepare(`INSERT INTO search_misses (query, day, source) VALUES (?, date('now'), ?)
    ON CONFLICT(query, day, source) DO UPDATE SET count = count + 1`).bind(key, source).run();
}

/** Վերջին 90 օրում ամենաշատ փնտրված և չգտնված բառերը։ */
export async function topMisses(db: D1Database, limit = 100) {
  const { results } = await db.prepare(`SELECT query, source, SUM(count) AS total, MAX(day) AS last FROM search_misses
    WHERE day >= date('now', '-90 days') GROUP BY query, source ORDER BY total DESC, last DESC LIMIT ?`).bind(limit).all<{ query: string; source: string; total: number; last: string }>();
  return results;
}

export function forgetMiss(db: D1Database, query: string) {
  return db.prepare("DELETE FROM search_misses WHERE query = ?").bind(query).run();
}
