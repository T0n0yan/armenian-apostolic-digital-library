// Renders sample link-preview cards in Node (for checking the layout): npx tsx scripts/og-card-preview.ts <out-dir>
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import satori from "satori";

import { OG_CARD_HEIGHT, OG_CARD_WIDTH, ogCardElement } from "../app/utils/og-card-layout";

const out = process.argv[2] ?? ".";
await initWasm(readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm"));
const fonts = [
  { name: "Noto Serif Armenian", data: readFileSync("app/assets/og-fonts/NotoSerifArmenian-Regular.ttf"), weight: 400 as const, style: "normal" as const },
  { name: "Noto Serif Armenian", data: readFileSync("app/assets/og-fonts/NotoSerifArmenian-SemiBold.ttf"), weight: 600 as const, style: "normal" as const },
];
const samples = {
  verse: { section: "ՍԱՂՄՈՍՆԵՐ", label: "Սաղմոս 22:3", text: "Դալար վայրերում նա ինձ բնակեցրեց եւ հանդարտ ջրերի մօտ ինձ սնուցեց։" },
  prayer: { section: "ԱՂՈԹՔՆԵՐ", label: "Սոյն աղոթքը, որ յայտնի է նաեւ «Հայր մեր» անուամբ, իբրեւ մեր Տէր Յիսուս Քրիստոսի շուրթերից ելած ուսուցում", text: "Սոյն աղոթքը, որ յայտնի է նաեւ «Հայր մեր» անուամբ, իբրեւ մեր Տէր Յիսուս Քրիստոսի շուրթերից ելած ուսուցում, ամենից նուիրականն ու հոգեհարազատն է հանուր քրիստոնէական աշխարհում, որովհետեւ այն մեզ տուեց Ինքը՝ Տէրը։" },
};
for (const [name, card] of Object.entries(samples)) {
  const started = performance.now();
  const svg = await satori(ogCardElement(card) as never, { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_CARD_WIDTH } }).render().asPng();
  writeFileSync(`${out}/${name}.png`, png);
  console.log(name, Math.round(performance.now() - started), "ms");
}
