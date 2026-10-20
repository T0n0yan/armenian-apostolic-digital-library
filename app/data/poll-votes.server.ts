export type PollVotes = { counts: number[]; mine: number | null };

/** The library's votes on a poll, per option, and the reader's own choice. */
export async function getPollVotes(database: D1Database, chatId: string, messageId: number, optionCount: number, userId: string | null): Promise<PollVotes> {
  const { results } = await database.prepare(
    "SELECT option_index, COUNT(*) AS votes FROM poll_votes WHERE chat_id = ? AND message_id = ? GROUP BY option_index",
  ).bind(chatId, messageId).all<{ option_index: number; votes: number }>();
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const row of results) if (row.option_index < optionCount) counts[row.option_index] = row.votes;
  const mine = userId
    ? (await database.prepare("SELECT option_index FROM poll_votes WHERE user_id = ? AND chat_id = ? AND message_id = ?")
      .bind(userId, chatId, messageId).first<{ option_index: number }>())?.option_index ?? null
    : null;
  return { counts, mine };
}

/** Records the reader's single vote (a second tap doesn't change it, as on Telegram). */
export async function castPollVote(database: D1Database, userId: string, chatId: string, messageId: number, option: number) {
  await database.prepare("INSERT OR IGNORE INTO poll_votes (user_id, chat_id, message_id, option_index) VALUES (?, ?, ?, ?)")
    .bind(userId, chatId, messageId, option).run();
}

export type QuizResult = "right" | "wrong" | "answered";

/** The reader's answers on a topic's polls: right or wrong for quizzes, "answered" otherwise. */
export async function quizResults(database: D1Database, userId: string, topicKey: string): Promise<Record<string, QuizResult>> {
  const { results } = await database.prepare(
    `SELECT votes.chat_id, votes.message_id, votes.option_index, materials.poll_json
     FROM poll_votes AS votes
     INNER JOIN library_materials AS materials ON materials.chat_id = votes.chat_id AND materials.message_id = votes.message_id
     WHERE votes.user_id = ? AND materials.topic_key = ?`,
  ).bind(userId, topicKey).all<{ chat_id: string; message_id: number; option_index: number; poll_json: string | null }>();
  const out: Record<string, QuizResult> = {};
  for (const row of results) {
    let correct = -1;
    try { correct = (JSON.parse(row.poll_json ?? "null") as { options?: Array<{ correct?: boolean }> } | null)?.options?.findIndex((option) => option.correct) ?? -1; } catch { correct = -1; }
    const id = `material_tg_${row.chat_id.startsWith("-") ? `n${row.chat_id.slice(1)}` : `p${row.chat_id}`}_${row.message_id}`;
    out[id] = correct < 0 ? "answered" : correct === row.option_index ? "right" : "wrong";
  }
  return out;
}
