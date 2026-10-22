import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/wasm";
import initYoga from "yoga-wasm-web";
import yogaWasm from "yoga-wasm-web/dist/yoga.wasm";

import regularFont from "../assets/og-fonts/NotoSerifArmenian-Regular.ttf?inline";
import semiBoldFont from "../assets/og-fonts/NotoSerifArmenian-SemiBold.ttf?inline";
import { OG_CARD_HEIGHT, OG_CARD_WIDTH, ogCardElement } from "../utils/og-card-layout";


// Workers may only run WebAssembly bundled with them, so both engines start from imported modules.
let ready: Promise<void> | null = null;
function start() {
  ready ??= Promise.all([initYoga(yogaWasm as WebAssembly.Module).then(initSatori), initWasm(resvgWasm as WebAssembly.Module)])
    .then(() => undefined)
    .catch((error) => { ready = null; throw error; });
  return ready;
}

function fontData(dataUrl: string) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

/** A link-preview picture (PNG) of the card in og-card-layout.ts. */
export async function renderOgCard(card: { label: string; text: string; section: string }) {
  await start();
  const svg = await satori(ogCardElement(card) as unknown as Parameters<typeof satori>[0], {
    width: OG_CARD_WIDTH,
    height: OG_CARD_HEIGHT,
    fonts: [
      { name: "Noto Serif Armenian", data: fontData(regularFont), weight: 400, style: "normal" },
      { name: "Noto Serif Armenian", data: fontData(semiBoldFont), weight: 600, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_CARD_WIDTH } }).render().asPng();
}
