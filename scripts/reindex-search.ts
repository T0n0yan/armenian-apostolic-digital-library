/**
 * Rebuilds the search index's normalized text after the search normalizer changes (for example
 * classical/reformed spelling folding). Reads every indexed field from D1 and writes the new
 * normalized text and aliases back; the shown text is not touched. New posts are indexed by the
 * sync with the same normalizer, so this is only needed once per normalizer change.
 *
 *   pnpm tsx scripts/reindex-search.ts staging
 *   pnpm tsx scripts/reindex-search.ts production
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeTelegramSearchText, searchAliases } from "../shared/telegram-search";

const target = process.argv[2];
if (target !== "staging" && target !== "production") throw new Error("Usage: reindex-search.ts staging|production");
const database = `armenian-apostolic-digital-library-${target}`;
const wrangler = (args: string[]) => execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", database, "--env", target, "--remote", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

type Row = { chat_id: string; message_id: number; field_id: string; original_text: string };
const rows = (JSON.parse(wrangler(["--json", "--command", "SELECT chat_id, message_id, field_id, original_text FROM library_search_documents"])) as Array<{ results: Row[] }>)[0].results;
const sql = (value: string | number) => typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;

const statements = ["DELETE FROM library_search_fts;"];
for (const row of rows) {
  const normalized = normalizeTelegramSearchText(row.original_text);
  const aliases = searchAliases(row.original_text).join(" ");
  statements.push(`UPDATE library_search_documents SET normalized_text=${sql(normalized)}, aliases_text=${sql(aliases)} WHERE chat_id=${sql(row.chat_id)} AND message_id=${row.message_id} AND field_id=${sql(row.field_id)};`);
  statements.push(`INSERT INTO library_search_fts(chat_id,message_id,field_id,normalized_text,aliases_text) VALUES(${sql(row.chat_id)},${row.message_id},${sql(row.field_id)},${sql(normalized)},${sql(aliases)});`);
}
const file = join(mkdtempSync(join(tmpdir(), "reindex-")), "reindex.sql");
writeFileSync(file, statements.join("\n"));
console.log(`${rows.length} fields → ${file}`);
console.log(wrangler(["--file", file, "--yes"]).split("\n").filter((line) => /rows|✅|error/iu.test(line)).join("\n"));
