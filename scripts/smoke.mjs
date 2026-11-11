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

// Էջի JS և CSS ֆայլերը. սխալ build-ի դեպքում էջը բացվում է, բայց չի աշխատում։
const assetsOf = (html) => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/gu)].map((match) => match[1]))];
const homeAssets = assetsOf(home).slice(0, 6);
for (const asset of homeAssets) await step(asset, null, { accept: "*/*" });
if (home && homeAssets.length === 0) failures.push("/: JS/CSS ֆայլերի հղումներ չգտնվեցին");

// Այն էջը, որը ընթերցողը կստանա (առանց ?smoke, cache-ով)։ Նախորդ build-ի պատրաստ էջը հին ֆայլերի
// հղումներով կոտրված կլիներ։ Բայց deploy-ից անմիջապես հետո որոշ հարցումներ դեռ պատասխանում է
// Worker-ի նախորդ տարբերակը (տարածումը մի քանի վայրկյան է). նրա էջի ֆայլերը նոր տարբերակում
// չկան և 404 են։ Ուստի էջը կրկին վերցնում ենք մինչև ~1 րոպե. ձախողում է միայն այն դեպքում, երբ
// հին էջը այդքան ժամանակ հետո էլ է տրվում (իսկական cache-ի խնդիր)։
const CACHED_ROUNDS = 6;
const CACHED_WAIT_MS = 10_000;
async function missingAssets(html) {
  const missing = [];
  for (const asset of assetsOf(html).slice(0, 6)) {
    if (homeAssets.includes(asset)) continue; // արդեն ստուգված է վերևում
    try {
      const response = await fetch(`${base}${asset}`, { headers: { accept: "*/*", "user-agent": "apostolic-smoke-check" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      await response.arrayBuffer();
      if (response.status !== 200) missing.push(`${asset}: ${response.status}`);
    } catch (error) {
      missing.push(`${asset}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return missing;
}
if (home) {
  let missing = [];
  for (let round = 1; round <= CACHED_ROUNDS; round++) {
    const cachedHome = await step("/", /<html lang="hy"/u, { fresh: false });
    if (!cachedHome) break; // ձախողումն արդեն գրանցված է
    missing = await missingAssets(cachedHome);
    if (missing.length === 0) { console.log("✓ cache-ի էջի ֆայլերը"); break; }
    if (round < CACHED_ROUNDS) {
      console.log(`… cache-ի էջը դեռ հին ֆայլերի հղումներով է (${missing.length}), ${CACHED_WAIT_MS / 1000} վրկ հետո կրկին (${round}/${CACHED_ROUNDS})`);
      await new Promise((resolve) => setTimeout(resolve, CACHED_WAIT_MS));
    }
  }
  for (const item of missing) {
    failures.push(`/ (cache): ${item}`);
    console.error(`✗ / (cache): ${item}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} ստուգում ձախողվեց`);
  process.exit(1);
}
console.log("\nԿայքը աշխատում է");
