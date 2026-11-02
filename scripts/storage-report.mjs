// Միայն կարդում է. ինչով է լցված Cloudflare-ի պահեստը (բոլոր R2 բաքեթները) և բազաները (D1)։
// GitHub Actions-ում՝ storage-report.yml. արդյունքը գրվում է գործարկման ամփոփման մեջ։
import { appendFileSync } from "node:fs";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID և CLOUDFLARE_API_TOKEN պետք են");
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const out = [];
const say = (line = "") => { out.push(line); console.log(line); };
const gb = (bytes) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} ԳԲ` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} ՄԲ` : `${Math.round(bytes / 1e3)} ԿԲ`;

async function call(path, init) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`${path}: ${response.status} ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  return body;
}

function table(head, rows) {
  say(`| ${head.join(" | ")} |`);
  say(`| ${head.map(() => "---").join(" | ")} |`);
  for (const row of rows) say(`| ${row.join(" | ")} |`);
  say();
}

// ---------- R2 ----------
const buckets = (await call("/r2/buckets")).result.buckets ?? [];
say("# R2 պահեստ");
const bucketTotals = [];
for (const bucket of buckets) {
  const objects = [];
  let cursor = "";
  do {
    const body = await call(`/r2/buckets/${bucket.name}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    objects.push(...body.result);
    cursor = body.result_info?.is_truncated ? body.result_info.cursor : "";
  } while (cursor);
  const total = objects.reduce((sum, object) => sum + (object.size ?? 0), 0);
  bucketTotals.push([bucket.name, objects.length, total]);
  say(`## ${bucket.name} — ${gb(total)}, ${objects.length} ֆայլ`);
  const group = (keyOf) => {
    const map = new Map();
    for (const object of objects) {
      const key = keyOf(object);
      const item = map.get(key) ?? { files: 0, bytes: 0 };
      item.files += 1; item.bytes += object.size ?? 0;
      map.set(key, item);
    }
    return [...map].sort((a, b) => b[1].bytes - a[1].bytes);
  };
  const prefix = (key, depth) => key.split("/").slice(0, depth).join("/") + (key.split("/").length > depth ? "/" : "");
  say("### Ըստ թղթապանակի");
  table(["Թղթապանակ", "Ֆայլ", "Չափ", "%"], group((object) => prefix(object.key, 1)).map(([key, item]) => [key, item.files, gb(item.bytes), `${((item.bytes / Math.max(total, 1)) * 100).toFixed(1)}%`]));
  say("### Ըստ ենթաթղթապանակի (առաջին 20)");
  table(["Ենթաթղթապանակ", "Ֆայլ", "Չափ"], group((object) => prefix(object.key, 2)).slice(0, 20).map(([key, item]) => [key, item.files, gb(item.bytes)]));
  say("### Ըստ ֆայլի տեսակի");
  table(["Տեսակ", "Ֆայլ", "Չափ"], group((object) => object.http_metadata?.contentType || (/\.([a-z0-9]+)$/i.exec(object.key)?.[1] ?? "?")).slice(0, 15).map(([key, item]) => [key, item.files, gb(item.bytes)]));
  say("### Ըստ վերբեռնման ամսի");
  table(["Ամիս", "Ֆայլ", "Չափ"], group((object) => String(object.last_modified ?? "").slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])).map(([key, item]) => [key, item.files, gb(item.bytes)]));
  say("### Ամենամեծ 25 ֆայլը");
  table(["Ֆայլ", "Չափ", "Ամսաթիվ"], [...objects].sort((a, b) => b.size - a.size).slice(0, 25).map((object) => [`\`${object.key}\``, gb(object.size), String(object.last_modified ?? "").slice(0, 10)]));
}

// ---------- D1 ----------
say("# D1 բազաներ");
const databases = (await call("/d1/database?per_page=100")).result ?? [];
table(["Բազա", "Չափ", "Աղյուսակներ"], databases.map((db) => [db.name, gb(Number(db.file_size ?? 0)), db.num_tables ?? "?"]));
const query = async (id, sql) => (await call(`/d1/database/${id}/query`, { method: "POST", body: JSON.stringify({ sql }) })).result?.[0]?.results ?? [];
for (const db of databases.filter((item) => /production|staging/.test(item.name))) {
  say(`## ${db.name}`);
  let sizes = new Map();
  try { sizes = new Map((await query(db.uuid, "SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name")).map((row) => [row.name, row.bytes])); } catch { /* dbstat չկա */ }
  const tables = await query(db.uuid, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
  const rows = [];
  for (const { name } of tables) {
    const [count] = await query(db.uuid, `SELECT COUNT(*) AS n FROM "${name}"`).catch(() => [{ n: "?" }]);
    rows.push([name, count?.n ?? "?", sizes.get(name) ?? 0]);
  }
  rows.sort((a, b) => b[2] - a[2] || Number(b[1]) - Number(a[1]));
  table(["Աղյուսակ", "Տող", "Չափ (ինդեքսներից առանց)"], rows.map(([name, count, bytes]) => [name, count, bytes ? gb(bytes) : "—"]));
  if (sizes.size) {
    const indexes = [...sizes].filter(([name]) => !tables.some((item) => item.name === name)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    say("### Ամենամեծ ինդեքսները");
    table(["Ինդեքս", "Չափ"], indexes.map(([name, bytes]) => [name, gb(bytes)]));
  }
  try {
    say("### Մեդիան ըստ տեսակի (library_media, բազայի տվյալով)");
    table(["Տեսակ", "Վիճակ", "Ֆայլ", "Չափ"], (await query(db.uuid, "SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes FROM library_media GROUP BY kind, status ORDER BY bytes DESC")).map((row) => [row.kind, row.status, row.n, gb(row.bytes)]));
  } catch (error) { say(`library_media՝ ${error.message}`); }
}

say("# Ամփոփում");
table(["Բաքեթ", "Ֆայլ", "Չափ"], bucketTotals.map(([name, files, bytes]) => [name, files, gb(bytes)]));
say(`R2 ընդհանուր՝ ${gb(bucketTotals.reduce((sum, item) => sum + item[2], 0))}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
