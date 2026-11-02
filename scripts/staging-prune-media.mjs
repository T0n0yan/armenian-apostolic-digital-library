// Միայն staging. ջնջում է staging-ի պահեստից այն ֆայլերը, որոնք բազայում մնացած նյութերին պետք չեն
// (staging-reset.sql-ից հետո), և բոլոր հղումների քարտերը։ Պռոդի բաքեթը երբեք չի դիպչում։
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const bucket = "armenian-apostolic-library-media-staging";
const database = "armenian-apostolic-digital-library-staging";
if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID և CLOUDFLARE_API_TOKEN պետք են");
if (/production/.test(bucket + database)) throw new Error("Պռոդը չի կարելի");
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function call(path, init = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`${path}: ${response.status} ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  return body;
}
const db = (await call(`/d1/database?name=${database}`)).result.find((item) => item.name === database);
const query = async (sql) => (await call(`/d1/database/${db.uuid}/query`, { method: "POST", body: JSON.stringify({ sql }) })).result[0].results;
const rows = await query(`SELECT md.r2_key AS a, md.thumbnail_r2_key AS b FROM library_media md JOIN library_materials m
  ON m.chat_id = md.chat_id AND m.message_id = md.message_id WHERE m.sync_state <> 'deleted' AND m.deleted_at IS NULL
  UNION ALL SELECT ma.r2_key, NULL FROM material_attachments ma JOIN library_materials m
  ON m.chat_id = ma.chat_id AND m.message_id = ma.message_id WHERE m.sync_state <> 'deleted' AND m.deleted_at IS NULL`);
const keep = new Set(rows.flatMap((row) => [row.a, row.b]).filter(Boolean));
// Ֆայլը պետք է, եթե նրա բանալին կամ թղթապանակը (նույն մեդիայի տարբերակները) հիշատակված է բազայում։
const folders = new Set([...keep].map((key) => key.split("/").slice(0, -1).join("/")));
const objects = [];
let cursor = "";
do {
  const body = await call(`/r2/buckets/${bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  objects.push(...body.result);
  cursor = body.result_info?.is_truncated ? body.result_info.cursor : "";
} while (cursor);
const remove = objects.filter((object) => {
  if (object.key.startsWith("public-index/")) return false;
  if (object.key.startsWith("og/") || object.key.startsWith("places/") || object.key.startsWith("submissions/")) return true;
  return !keep.has(object.key) && !folders.has(object.key.split("/").slice(0, -1).join("/"));
});
const bytes = remove.reduce((sum, object) => sum + object.size, 0);
console.log(`Բազան պահում է ${keep.size} ֆայլ։ Ջնջվում է ${remove.length} ֆայլ՝ ${(bytes / 1e9).toFixed(2)} ԳԲ, մնում է ${objects.length - remove.length}։`);
let done = 0;
const queue = [...remove];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let object = queue.shift(); object; object = queue.shift()) {
    await call(`/r2/buckets/${bucket}/objects/${object.key.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" });
    done += 1;
    if (done % 200 === 0) console.log(`${done}/${remove.length}`);
  }
}));
console.log(`Պատրաստ է. ջնջվեց ${done} ֆայլ։`);
