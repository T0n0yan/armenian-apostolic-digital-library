import { locationPlaceholder } from "./og-card-location.server";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/standalone";
import yogaWasm from "satori/layout.wasm";

import regularFont from "../assets/og-fonts/NotoSerifArmenian-Regular.ttf?inline";
import semiBoldFont from "../assets/og-fonts/NotoSerifArmenian-SemiBold.ttf?inline";

const WIDTH = 1200;
const HEIGHT = 630;

// Workers may only run WebAssembly bundled with them, so both engines start from imported modules.
let ready: Promise<void> | null = null;
function start() {
  ready ??= Promise.all([initSatori(yogaWasm as WebAssembly.Module), initWasm(resvgWasm as WebAssembly.Module)])
    .then(() => undefined)
    .catch((error) => { ready = null; throw error; });
  return ready;
}

// Satori has loaded by now; Workers go on without a `location` (og-card-location.server.ts).
if (locationPlaceholder) delete (globalThis as { location?: unknown }).location;

function fontData(dataUrl: string) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

/** At most `limit` characters, cut at a word, with "…" when shortened. */
export function excerpt(text: string, limit = 210) {
  const clean = text.replace(/[​-‍﻿]/gu, "").replace(/\s+/gu, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).replace(/\s+\S*$/u, "").replace(/[,;:։՝.\s]+$/u, "")}…`;
}

/**
 * A link-preview picture (1200×630 PNG) on the site's parchment background: the material's name in
 * gold above, a short passage of its text, and the library's name below.
 */
export async function renderOgCard({ label, text, section }: { label: string; text: string; section: string }) {
  await start();
  const passage = excerpt(text);
  const size = passage.length <= 90 ? 54 : passage.length <= 150 ? 46 : 40;
  const svg = await satori(
    // Satori reads React-shaped element objects; no React is needed to make them.
    h("div", {
      width: "100%", height: "100%", display: "flex", padding: 34,
      backgroundColor: "#ead9b8",
      backgroundImage: "radial-gradient(circle at 50% -10%, rgba(255,246,222,0.85), rgba(255,246,222,0) 60%), radial-gradient(circle at 6% 45%, rgba(196,150,86,0.22), rgba(196,150,86,0) 420px), radial-gradient(circle at 96% 78%, rgba(176,128,70,0.2), rgba(176,128,70,0) 460px), linear-gradient(170deg, #f3e8cf 0%, #ead9b8 55%, #e6d3ae 100%)",
    }, h("div", {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: "100%", height: "100%",
      border: "2px solid rgba(176,125,46,0.55)", borderRadius: 26, padding: "40px 64px 34px",
    }, [
      h("div", { display: "flex", flexDirection: "column", alignItems: "center" }, [
        h("div", { fontSize: 24, letterSpacing: 3, color: "#8a5a1c", fontWeight: 400 }, section),
        h("div", { fontSize: 40, color: "#a06d22", fontWeight: 600, marginTop: 6, textAlign: "center" }, label),
        h("div", { width: 220, height: 2, marginTop: 16, backgroundImage: "linear-gradient(90deg, rgba(176,125,46,0), #b07d2e, rgba(176,125,46,0))" }),
      ]),
      h("div", { display: "flex", fontSize: size, lineHeight: 1.45, color: "#3a2412", textAlign: "center", fontWeight: 400, maxWidth: 1000 }, `«${passage}»`),
      h("div", { fontSize: 24, color: "#7a5a3a", fontWeight: 400 }, "Հոգևոր ժառանգություն · apostolic.am"),
    ])) as unknown as Parameters<typeof satori>[0],
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Noto Serif Armenian", data: fontData(regularFont), weight: 400, style: "normal" },
        { name: "Noto Serif Armenian", data: fontData(semiBoldFont), weight: 600, style: "normal" },
      ],
    },
  );
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
}
