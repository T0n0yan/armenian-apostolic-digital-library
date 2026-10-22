/**
 * Draws the link-preview cards (app/utils/og-card-layout.ts) of psalms, their verses, prayers and
 * Bible questions, and keeps them in the environment's R2 bucket under og/v1/<path>.jpg, where
 * /og/card/<path> serves them. Only new or edited materials are drawn again (og/v1/manifest.json).
 * A Worker request may not use the ~1 s of CPU a card takes, so GitHub Actions draws them
 * (.github/workflows/og-cards.yml).
 *
 *   OG_SITE=https://staging.apostolic.am OG_BUCKET=armenian-apostolic-library-media-staging \
 *   CLOUDFLARE_API_TOKEN=… npx tsx scripts/og-cards.ts
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import jpeg from "jpeg-js";
import satori from "satori";

import { OG_CARD_HEIGHT, OG_CARD_LAYOUT, OG_CARD_WIDTH, ogCardElement } from "../app/utils/og-card-layout";

type Card = { path: string; version: string; section: string; label: string; subtitle?: string; text: string; byline?: string };

const site = (process.env.OG_SITE ?? "").replace(/\/+$/u, "");
const bucket = process.env.OG_BUCKET ?? "";
const force = process.argv.includes("--force");
if (!site || !bucket) throw new Error("OG_SITE and OG_BUCKET are required.");
const work = mkdtempSync(join(tmpdir(), "og-cards-"));

async function wrangler(args: string[]) {
  for (let attempt = 1; ; attempt += 1) {
    const child = spawn(process.execPath, [join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"), ...args], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const [code] = await once(child, "exit") as [number | null];
    if (code === 0) return output;
    if (attempt >= 3) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed: ${output.slice(-600)}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
}

const objectName = (key: string) => `${bucket}/${key}`;
const manifestKey = "og/v1/manifest.json";

async function readManifest(): Promise<Record<string, string>> {
  const file = join(work, "manifest.json");
  try {
    await wrangler(["r2", "object", "get", objectName(manifestKey), "--file", file, "--remote"]);
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveManifest(manifest: Record<string, string>) {
  const file = join(work, "manifest.json");
  writeFileSync(file, JSON.stringify(manifest));
  await wrangler(["r2", "object", "put", objectName(manifestKey), "--file", file, "--content-type", "application/json", "--remote"]);
}

const started = Date.now();

async function listCards() {
  const cards: Card[] = [];
  for (const section of ["psalms", "pray", "saints", "gospel", "daily", "questions"]) {
    let cursor: string | null = null;
    for (;;) {
      const url = new URL(`${site}/api/og-cards`);
      url.searchParams.set("section", section);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url);
      // The site has no card list before this change reaches it (production until release); after a
      // push (OG_WAIT) the deploy may still be running, so wait for it up to a quarter of an hour.
      if (response.status === 404 || (process.env.OG_WAIT && (response.status === 403 || response.status === 400))) {
        if (process.env.OG_WAIT && Date.now() - started < 15 * 60_000) { await new Promise((resolve) => setTimeout(resolve, 30_000)); continue; }
        console.log(`${site} has no card list yet`);
        process.exit(0);
      }
      if (!response.ok) throw new Error(`${url.pathname}?section=${section}: ${response.status}`);
      const page = await response.json() as { cards: Card[]; next: string | null };
      cards.push(...page.cards);
      cursor = page.next;
      if (!cursor) break;
    }
  }
  return cards;
}

await initWasm(readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm"));
const fonts = [
  { name: "Noto Serif Armenian", data: readFileSync("app/assets/og-fonts/NotoSerifArmenian-Regular.ttf"), weight: 400 as const, style: "normal" as const },
  { name: "Noto Serif Armenian", data: readFileSync("app/assets/og-fonts/NotoSerifArmenian-SemiBold.ttf"), weight: 600 as const, style: "normal" as const },
];

async function draw(card: Card) {
  const svg = await satori(ogCardElement(card) as never, { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT, fonts });
  const image = new Resvg(svg, { fitTo: { mode: "width", value: OG_CARD_WIDTH } }).render();
  return jpeg.encode({ data: Buffer.from(image.pixels), width: image.width, height: image.height }, 88).data;
}

const manifest = await readManifest();
const cards = await listCards();
const stamp = (card: Card) => `${OG_CARD_LAYOUT}:${card.version}:${card.label.length}:${card.subtitle?.length ?? 0}:${card.text.length}:${card.byline ?? ""}`;
const pending = cards.filter((card) => force || manifest[card.path] !== stamp(card));
console.log(`${cards.length} cards, ${pending.length} to draw`);
let done = 0;
// A few uploads at a time; drawing is quick next to Wrangler's start-up.
const queue = [...pending];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let card = queue.shift(); card; card = queue.shift()) {
    const file = join(work, `${card.path.replace(/[^a-z0-9]+/gu, "-")}.jpg`);
    writeFileSync(file, await draw(card));
    await wrangler(["r2", "object", "put", objectName(`og/v1${card.path}.jpg`), "--file", file, "--content-type", "image/jpeg", "--cache-control", "public, max-age=86400", "--remote"]);
    manifest[card.path] = stamp(card);
    done += 1;
    if (done % 50 === 0) { console.log(`${done}/${pending.length}`); await saveManifest(manifest); }
  }
}));
if (pending.length) await saveManifest(manifest);
console.log(`drew ${done} cards`);
