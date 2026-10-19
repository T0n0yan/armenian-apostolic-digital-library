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
