#!/usr/bin/env node
// Թողարկումից հետո կայքի արագ ստուգում (deploy.yml)։ Աշխատեցնել՝
//   node scripts/smoke.mjs https://apostolic.am
// Ստուգում է գլխավոր էջերը, մեկ սաղմոս, sitemap-ը և էջի JS/CSS ֆայլերը։ Ձախողվելիս ելքը 1 է,
// և deploy.yml-ը Worker-ը վերադարձնում է նախորդ տարբերակին։ Նոր տարբերակը տարածվում է մի քանի
// վայրկյանում, ուստի ամեն հասցե փորձվում է մինչև 4 անգամ։

const base = (process.argv[2] ?? "").replace(/\/$/u, "");
if (!/^https:\/\//u.test(base)) {
  console.error("Օգտագործում՝ node scripts/smoke.mjs https://apostolic.am");
  process.exit(2);
}

const ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;

/** Մեկ հասցե. պատասխանը 200 է և պարունակում է սպասված տեքստը։ */
async function check(path, expect, { accept = "text/html", fresh = true } = {}) {
  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      // ?smoke=… — cache-ից դուրս, որ ստուգվի հենց նոր տարբերակը (fresh: false՝ ինչպես ընթերցողը կստանա)։
      const url = fresh ? `${base}${path}${path.includes("?") ? "&" : "?"}smoke=${Date.now()}` : `${base}${path}`;
      const response = await fetch(url, { headers: { accept, "user-agent": "apostolic-smoke-check" }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await response.text();
      const ms = Date.now() - started;
      if (response.status === 200 && (!expect || expect.test(body))) {
        console.log(`✓ ${path} ${response.status} ${ms}ms ${response.headers.get("server-timing") ?? ""}`);
        return body;
      }
      last = `${response.status}, ${expect && !expect.test(body) ? `չկա ${expect}` : ""}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
  }
  throw new Error(`${path}: ${last}`);
}

const failures = [];
async function step(path, expect, options) {
  try {
    return await check(path, expect, options);
  } catch (error) {
    failures.push(error.message);
    console.error(`✗ ${error.message}`);
    return "";
  }
}

const home = await step("/", /<html lang="hy"/u);
const psalms = await step("/psalms", /Սաղմոս/u);
await step("/pray", /Աղոթք/u);
await step("/sitemap.xml", /<urlset/u, { accept: "application/xml" });
await step("/robots.txt", /Sitemap:/iu, { accept: "text/plain" });
await step("/api/content-version", /"version"/u, { accept: "application/json" });

// Մեկ իրական նյութ՝ առաջին սաղմոսի հղումը ցանկից (բազան և SSR-ը միասին)։
const psalm = psalms.match(/href="(\/psalms\/\d+)"/u)?.[1];
if (psalm) await step(psalm, /<article/u);
else if (psalms) failures.push("/psalms: սաղմոսի հղում չգտնվեց");

// Էջի JS և CSS ֆայլերը. սխալ build-ի դեպքում էջը բացվում է, բայց չի աշխատում։ Ստուգվում է նաև
// այն էջը, որը ընթերցողը կստանա cache-ից (նախորդ build-ի ֆայլերի հղումներով էջը կոտրված կլիներ)։
const cachedHome = await step("/", /<html lang="hy"/u, { fresh: false });
const assetsOf = (html) => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/gu)].map((match) => match[1]))];
const assetsNow = (pages) => [...new Set(pages.flatMap((html) => assetsOf(html).slice(0, 6)))];
/** Ֆայլը տալի՞ս է 200 (մեկ փորձ, առանց ձախողում գրանցելու)։ */
const reachable = async (asset) => {
  try { return (await fetch(`${base}${asset}`, { headers: { accept: "*/*", "user-agent": "apostolic-smoke-check" }, signal: AbortSignal.timeout(TIMEOUT_MS) })).status === 200; } catch { return false; }
};
// Թողարկումից անմիջապես հետո մի քանի վայրկյան Cloudflare-ը դեռ կարող է տալ նախորդ տարբերակի էջը,
// որի JS ֆայլերն արդեն չկան (2026-11-11-ին staging-ը սրա պատճառով սխալմամբ հետ վերադարձվեց)։
// Ուստի, եթե որևէ ֆայլ չկա, էջերը նորից են վերցվում, և վերջնական ստուգվում են միայն դրանց ֆայլերը։
let assets = assetsNow([home, cachedHome]);
for (let round = 1; round <= 3; round++) {
  const missing = [];
  for (const asset of assets) if (!(await reachable(asset))) missing.push(asset);
  if (!missing.length) break;
  console.log(`… ${missing.length} ֆայլ դեռ չկա (հնարավոր է՝ նախորդ տարբերակի էջ), սպասում եմ և նորից վերցնում էջը (${round}/3)`);
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  assets = assetsNow([await step("/", /<html lang="hy"/u), await step("/", /<html lang="hy"/u, { fresh: false })]);
}
for (const asset of assets) await step(asset, null, { accept: "*/*", fresh: false });
if (home && assetsOf(home).length === 0) failures.push("/: JS/CSS ֆայլերի հղումներ չգտնվեցին");

if (failures.length) {
  console.error(`\n${failures.length} ստուգում ձախողվեց`);
  process.exit(1);
}
console.log("\nԿայքը աշխատում է");
