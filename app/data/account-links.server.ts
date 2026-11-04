/**
 * Աղյուսակներ, որոնց տողերը պատկանում են մեկ ընթերցողի (user_id). Google-ը Telegram-ին միացնելիս
 * դրանք բոլորը տեղափոխվում են։ Նոր աղյուսակ user_id-ով ավելացնելիս՝ ավելացնել այստեղ
 * (tests/account-links.test.ts-ը ստուգում է, որ ոչ մեկը մոռացված չէ)։
 */
export const USER_TABLES = [
  "saved_materials", "saved_verses", "reading_reminders", "reminder_inbox", "reading_log", "poll_votes", "push_subscriptions",
  "place_visits", "liturgy_marks", "user_settings", "yearly_summaries", "place_submissions", "admin_access", "highlights",
];
/** user_id ունեցող, բայց չտեղափոխվող աղյուսակներ (և պատճառը)։ */
export const NOT_MOVED: Record<string, string> = {
  app_users: "հաշիվն ինքը",
  account_links: "միացումների ցուցակը",
  site_presence: "այցերը անանուն են, հաշվի հետ չեն կապվում",
  reading_log_next: "միգրացիայի ժամանակավոր աղյուսակ",
  reading_reminders_next: "միգրացիայի ժամանակավոր աղյուսակ",
};

/**
 * Joins a Google account to the reader's Telegram account: its saved items, notes, reminders and
 * reading log move to the Telegram account (where both have the same item, the Telegram one stays),
 * and later Google sign-ins open the Telegram account.
 */
export async function joinAccounts(database: D1Database, aliasId: string, user: { id: string; telegramId: string }) {
  if (aliasId === user.id) return;
  // Մեկ ատոմային batch (D1-ի transaction). կա՛մ ամբողջ միացումը կատարվում է, կա՛մ ոչինչ. մասնակի
  // կորուստ չի լինում (A-16)։ Ամեն աղյուսակից տեղափոխում ենք, հետո ջնջում հինը, վերջում՝ կապը։
  const statements = [
    ...USER_TABLES.flatMap((table) => [
      database.prepare(`UPDATE OR IGNORE ${table} SET user_id = ? WHERE user_id = ?`).bind(user.id, aliasId),
      database.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(aliasId),
    ]),
    // Հիշեցումները բոտով հասնում են մարդուն իր Telegram id-ով։
    database.prepare("UPDATE reading_reminders SET telegram_id = ? WHERE user_id = ?").bind(user.telegramId, user.id),
    database.prepare("INSERT INTO account_links (alias_id, user_id) VALUES (?, ?) ON CONFLICT(alias_id) DO UPDATE SET user_id = excluded.user_id, linked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(aliasId, user.id),
  ];
  try {
    await database.batch(statements);
  } catch (error) {
    // Ձախողման դեպքում ոչինչ չի փոխվել (batch-ը ատոմային է)։ Գրանցում ենք՝ հետո նորից փորձելու համար։
    console.error(JSON.stringify({ event: "account_join_failed", aliasId, error: String(error) }));
    throw error;
  }
}

/** The Telegram account a Google account was joined to, or null. */
export async function linkedAccount(database: D1Database, aliasId: string) {
  return database.prepare(
    `SELECT users.id, users.telegram_id, users.display_name, users.username FROM account_links AS links
     INNER JOIN app_users AS users ON users.id = links.user_id WHERE links.alias_id = ?`,
  ).bind(aliasId).first<{ id: string; telegram_id: string; display_name: string; username: string | null }>().catch(() => null);
}
