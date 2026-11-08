import { EMPTY_LETTER, parseLetter, parseRecipientInput, type PrivateLetter } from "../utils/private-letter";

const KEY = "private_letter";

export async function getPrivateLetter(db: D1Database): Promise<PrivateLetter> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = ?").bind(KEY).first<{ value: string }>().catch(() => null);
  return row ? parseLetter(row.value) : EMPTY_LETTER;
}

export async function savePrivateLetter(db: D1Database, letter: PrivateLetter) {
  await db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    .bind(KEY, JSON.stringify(letter)).run();
}

/**
 * Էլ. հասցեից կամ @username-ից՝ կայքի հաշիվները։ Պահվում են անփոփոխ id-ները (ոչ թե հասցեն),
 * և դրանց կապված բոլոր հաշիվները, որ նամակը երևա և՛ կայքում (Google), և՛ Mini App-ում (Telegram)։
 */
export async function findRecipientAccounts(db: D1Database, input: string) {
  const ids = new Set<string>();
  const names: string[] = [];
  for (const item of parseRecipientInput(input)) {
    const isUsername = item.startsWith("@");
    const rows = await db.prepare(
      `SELECT users.id, users.display_name AS name, links.user_id AS mainId FROM app_users AS users
       LEFT JOIN account_links AS links ON links.alias_id = users.id
       WHERE lower(users.username) = ? AND users.id LIKE ?`,
    ).bind(isUsername ? item.slice(1) : item, isUsername ? "telegram:%" : "google:%").all<{ id: string; name: string; mainId: string | null }>();
    for (const row of rows.results) {
      ids.add(row.id);
      if (row.mainId) ids.add(row.mainId);
      names.push(row.name);
    }
  }
  // Գլխավոր հաշվին կապված մյուս հաշիվները նույնպես։
  for (const id of [...ids]) {
    const aliases = await db.prepare("SELECT alias_id AS id FROM account_links WHERE user_id = ?").bind(id).all<{ id: string }>();
    for (const alias of aliases.results) ids.add(alias.id);
  }
  return { ids: [...ids], names: [...new Set(names)] };
}
