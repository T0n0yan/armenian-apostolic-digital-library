// Ստեղծում է seed migration-ները (մեկ անգամ). npx tsx scripts/guides-seed/make-seed.ts
// 0058՝ եղած բաժինները (Վարք եկեղեցում, Յոթ խորհուրդներ, Հիշատակության օրեր), 0059՝ նոր սևագրերը։
// INSERT OR IGNORE՝ ադմինում արված փոփոխությունները չեն ջնջվում։
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeGuideBody, normalizeSources } from "../../app/utils/guides";
import { NEW_GUIDES, type SeedGuide } from "./new";

const existing = JSON.parse(readFileSync(new URL("./existing.json", import.meta.url), "utf8")) as SeedGuide[];
const icons: Record<string, [string, number]> = { sacraments: ["sparkles", 20], remembrance: ["flower", 30] };
const first: SeedGuide[] = [
  { slug: "etiquette", title: "Վարք եկեղեցում", description: "Ինչպես մտնել, մոմ վառել, կանգնել Պատարագին, հաղորդվել", kind: "link", link: "/church/etiquette", icon: "church", sort: 10 },
  ...existing.map((guide) => ({ ...guide, icon: icons[guide.slug][0], sort: icons[guide.slug][1] })),
];
const q = (value: string | number) => typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;
const rows = (all: SeedGuide[]) => all.map((guide) => {
  const body = normalizeGuideBody({ blocks: guide.blocks ?? [], faq: guide.faq ?? [] });
  const values = [guide.slug, guide.title, guide.description, guide.summary ?? "", guide.kind ?? "guide", guide.link ?? "", guide.icon,
    JSON.stringify(body), JSON.stringify(normalizeSources(guide.sources ?? [])), "review", guide.sort];
  return `INSERT OR IGNORE INTO guides (slug, title, description, summary, kind, link, icon, body_json, sources_json, status, sort) VALUES (${values.map(q).join(", ")});`;
});
const write = (file: string, note: string, all: SeedGuide[]) => writeFileSync(new URL(`../../migrations/${file}`, import.meta.url),
  `-- ${note} (ստեղծված է scripts/guides-seed/make-seed.ts-ով). բոլորը՝ «Ստուգման մեջ»։\n${rows(all).join("\n")}\n`);
write("0058_guides_seed.sql", "«Կարգեր և վարքեր»-ի եղած բաժինները", first);
if (process.argv.includes("--new")) write("0059_guides_drafts.sql", "Նոր ուղեցույցների սևագրերը (⚑ Ճշտել)", NEW_GUIDES);
