// docs/ARCHITECTURE.md → docs/architecture.html (ինտերակտիվ էջ՝ սխեմաներ, քայլ առ քայլ անիմացիա, որոնում)։
// Աշխատեցնել՝ node scripts/build-architecture-page.mjs
// Փոփոխությունները միշտ անել md-ում, հետո նորից աշխատեցնել այս ֆայլը. HTML-ը ձեռքով չխմբագրել։
import { readFileSync, writeFileSync } from "node:fs";

const source = new URL("../docs/ARCHITECTURE.md", import.meta.url);
const target = new URL("../docs/architecture.html", import.meta.url);
const md = readFileSync(source, "utf8");

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/ /g, "-");
const inline = (text) => escape(text)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\[([^\]]+)\]\((#[^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/(^|[\s(])(https:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');

// Բաժիններ՝ «## »-ով. ամեն մեկը առանձին քարտ։
const lines = md.split("\n");
const sections = [];
let intro = [];
let current = null;
let diagram = 0;
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const push = (html, text = "") => { (current ? current.body : intro).push(html); if (current) current.text += ` ${text}`; };
  if (line.startsWith("```")) {
    const lang = line.slice(3).trim();
    const block = [];
    i += 1;
    while (i < lines.length && !lines[i].startsWith("```")) block.push(lines[i++]);
    const code = block.join("\n");
    if (lang === "mermaid") {
      diagram += 1;
      push(`<figure class="diagram" data-diagram="${diagram}">
  <div class="tools">
    <button type="button" class="play" aria-label="Ցույց տալ քայլ առ քայլ">▶ Քայլ առ քայլ</button>
    <span class="steps" hidden><button type="button" class="prev" aria-label="Նախորդ քայլը">‹</button><output class="count">0/0</output><button type="button" class="next" aria-label="Հաջորդ քայլը">›</button><button type="button" class="stop" aria-label="Ցույց տալ ամբողջը">Ամբողջը</button></span>
    <span class="spacer"></span>
    <button type="button" class="zoom" aria-label="Մեծացնել">⤢ Մեծացնել</button>
    <button type="button" class="copy">Պատճենել կոդը</button>
    <a class="live" target="_blank" rel="noreferrer">mermaid.live ↗</a>
  </div>
  <div class="canvas"><pre class="src">${escape(code)}</pre></div>
</figure>`);
    } else {
      push(`<pre class="code"><code>${escape(code)}</code></pre>`, code);
    }
    continue;
  }
  if (line.startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
    i -= 1;
    const body = rows.filter((row) => !/^\|\s*-/.test(row)).map((row, index) => {
      const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
      const tag = index === 0 ? "th" : "td";
      return `<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join("")}</tr>`;
    });
    push(`<div class="table"><table>${body.join("")}</table></div>`, rows.join(" "));
    continue;
  }
  let match;
  if ((match = /^## (.*)/.exec(line))) {
    const number = /^(\d+)\./.exec(match[1])?.[1] ?? "";
    current = { id: slug(match[1]), title: match[1].replace(/^\d+\.\s*/, ""), number, body: [], text: match[1] };
    sections.push(current);
    continue;
  }
  if ((match = /^# (.*)/.exec(line))) { intro.push(`<h1>${inline(match[1])}</h1>`); continue; }
  if ((match = /^### (.*)/.exec(line))) { push(`<h3>${inline(match[1])}</h3>`, match[1]); continue; }
  if (line.startsWith("> ")) {
    const quote = [];
    while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
    i -= 1;
    push(`<p class="note">${inline(quote.join(" "))}</p>`, quote.join(" "));
    continue;
  }
  if (/^\s*\d+\. /.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s/, ""));
    i -= 1;
    push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`, items.join(" "));
    continue;
  }
  if (/^\s*- /.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*- /.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s/, ""));
    i -= 1;
    push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`, items.join(" "));
    continue;
  }
  if (line.trim() === "---" || !line.trim()) continue;
  // Իրար հաջորդող տողերը՝ մեկ պարբերություն։
  const paragraph = [line];
  while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|>|\||```|\s*- |\s*\d+\. |---)/.test(lines[i + 1])) paragraph.push(lines[++i]);
  push(`<p>${inline(paragraph.join(" "))}</p>`, paragraph.join(" "));
}

// Բովանդակության ցանկը md-ում արդեն կա որպես ցուցակ. էջում այն փոխարինվում է կողային մենյուով։
const introHtml = intro.filter((html) => !html.startsWith("<ol>")).join("\n");
const real = sections.filter((section) => section.title !== "Բովանդակություն");
const updated = /Վերջին թարմացումը՝ ([\d-]+)/.exec(md)?.[1] ?? "";
const nav = real.map((section) => `<a href="#${section.id}" data-nav="${section.id}"><span class="n">${section.number}</span><span>${escape(section.title)}</span></a>`).join("");
const body = real.map((section) => `<section id="${section.id}" class="part" data-text="${escape(section.text.toLowerCase())}">
  <header><span class="n">${section.number}</span><h2>${escape(section.title)}</h2></header>
  ${section.body.join("\n  ")}
</section>`).join("\n");

const page = readFileSync(new URL("./architecture-page.template.html", import.meta.url), "utf8")
  .replace("{{INTRO}}", introHtml)
  .replace("{{NAV}}", nav)
  .replace("{{BODY}}", body)
  .replace("{{UPDATED}}", updated)
  .replace("{{COUNT}}", String(diagram))
  .replace("{{SECTIONS}}", String(real.length));
// Ֆայլում՝ ամբողջական HTML (բացվում է ուղիղ բրաուզերում)։ «--bare ճանապարհ»՝ առանց <html> կմախքի (Artifact-ի համար)։
writeFileSync(target, `<!doctype html>\n<html lang="hy">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>\n<body>\n${page}\n</body>\n</html>\n`);
const bare = process.argv.indexOf("--bare");
if (bare !== -1 && process.argv[bare + 1]) writeFileSync(process.argv[bare + 1], page);
console.log(`docs/architecture.html՝ ${real.length} բաժին, ${diagram} սխեմա`);
