// Հանրային sitemap-ի հասցեները ստուգվում են երկու զուգահեռ հարցմամբ՝ առանց անձնական էջերի։
// Գործարկում՝ node scripts/seo-audit.mjs https://apostolic.am
const origin = new URL(process.argv[2] || "https://apostolic.am").origin;
const canonicalOrigin = "https://apostolic.am";
const failures = [];
const pages = [];
const decode = (s) => s.replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">");
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/gu)].map((m) => [m[1].toLowerCase(), decode(m[2])]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "giu"))].map((m) => attrs(m[0]));
async function fetchPage(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "apostolic-seo-audit" }, signal: AbortSignal.timeout(25_000) });
      const body = await response.text();
      if (response.status >= 500 && !attempt) continue;
      return { response, body };
    } catch (error) { if (attempt) throw error; }
  }
}
const sitemap = await fetchPage(`${origin}/sitemap.xml`);
if (sitemap.response.status !== 200 || !sitemap.body.includes("<urlset")) throw new Error("Sitemap-ը չի բացվում որպես URL ցանկ");
const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((m) => decode(m[1]));
if (!urls.length) throw new Error("Sitemap-ը դատարկ է");
if (new Set(urls).size !== urls.length) failures.push("Sitemap-ում կրկնվող հասցե կա");
for (const url of urls) if (new URL(url).origin !== canonicalOrigin) failures.push(`Sitemap-ում այլ դոմեն՝ ${url}`);
let next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    try {
      const path = new URL(url).pathname;
      const { response, body } = await fetchPage(`${origin}${path}`);
      const canonical = tags(body, "link").filter((tag) => tag.rel === "canonical");
      const robots = tags(body, "meta").filter((tag) => /^(robots|googlebot)$/u.test(tag.name ?? "")).map((tag) => tag.content).join(",");
      const title = [...body.matchAll(/<title>([^<]*)<\/title>/gu)].map((m) => decode(m[1]));
      const description = tags(body, "meta").filter((tag) => tag.name === "description");
      const problems = [];
      if (response.status !== 200) problems.push(`HTTP ${response.status}`);
      if (canonical.length !== 1 || canonical[0].href !== url) problems.push("հիմնական հասցեն չի համընկնում sitemap-ին");
      if (/\b(noindex|none)\b/iu.test(robots) || (origin === canonicalOrigin && /\b(noindex|none)\b/iu.test(response.headers.get("x-robots-tag") ?? ""))) problems.push("ինդեքսավորումն արգելված է");
      if (title.length !== 1 || !title[0].trim()) problems.push("մեկ ոչ դատարկ վերնագիր չկա");
      if (description.length !== 1 || !description[0].content?.trim()) problems.push("մեկ ոչ դատարկ նկարագրություն չկա");
      if ((body.match(/<h1\b/giu) ?? []).length !== 1) problems.push("մեկ H1 չկա");
      for (const problem of problems) failures.push(`${path}: ${problem}`);
      pages.push({ path, title: title[0] });
    } catch (error) { failures.push(`${url}: ${error.message}`); }
  }
}
await Promise.all([worker(), worker()]);
const titles = new Map();
for (const page of pages) {
  if (titles.has(page.title)) failures.push(`կրկնվող վերնագիր՝ ${titles.get(page.title)} և ${page.path}`);
  titles.set(page.title, page.path);
}
if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`Ստուգված՝ ${pages.length}/${urls.length}, խնդիր՝ ${failures.length}`);
  process.exitCode = 1;
} else console.log(`✓ ${pages.length} էջ՝ HTTP 200, ճիշտ canonical, ինդեքսավորման թույլտվություն, եզակի վերնագիր, նկարագրություն և H1`);
