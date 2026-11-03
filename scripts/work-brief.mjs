// Աշխատանքի ֆայլերի կարճ ամփոփում origin/main-ից (տոկեններ խնայելու համար)։
// Աշխատեցնել՝ node scripts/work-brief.mjs
// Տպում է README-ն և ամեն չաթի «Հիմա», «Հերթ», «Կարևոր մյուսների համար» բաժինները։
// «Արված»-ը (պատմությունը) բաց է թողնում. ամբողջը տեսնելու համար՝ --all։
import { execFileSync } from "node:child_process";

const all = process.argv.includes("--all");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

try {
  git("fetch", "-q", "origin", "main");
} catch {
  console.log("⚠ git fetch չստացվեց. ցույց եմ տալիս վերջին հայտնի origin/main-ը։\n");
}

const show = (file) => git("show", `origin/main:docs/work/${file}`).trim();

console.log(show("README.md"));
for (const file of ["bugs.md", "features.md", "integrations.md"]) {
  const text = show(file);
  if (all) {
    console.log(`\n\n${text}`);
    continue;
  }
  const [title, ...sections] = text.split(/^## /m);
  const kept = sections.filter((section) => !section.startsWith("Արված"));
  console.log(`\n\n${title.trim()} (docs/work/${file})\n\n## ${kept.join("## ").trim()}`);
}
