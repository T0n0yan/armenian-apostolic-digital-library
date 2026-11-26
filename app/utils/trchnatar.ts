import { preload } from "react-dom";

// Թռչնատառի ֆայլերը (մեկ ֆայլ՝ մեկ տառի մեծատառ+փոքրատառ), Vite-ի վերջնական հասցեներով։
// Նույն հասցեներն են օգտագործում trchnatar-faces.css-ի @font-face-երը, ուստի բրաուզերը նորից չի ներբեռնում։
const files = import.meta.glob("../assets/fonts/trchnatar/*.woff2", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const byCode = new Map(Object.entries(files).map(([path, url]) => [parseInt(path.slice(-10, -6), 16), url]));

const FAMILY = "Trchnatar Birds Color";

/** Ո՞ր ֆայլն է պետք այս տառի համար (փոքրատառը՝ իր մեծատառի ֆայլում)։ */
function fileFor(letter: string): string | undefined {
  const code = letter.codePointAt(0) ?? 0;
  return byCode.get(code >= 0x561 && code <= 0x586 ? code - 0x30 : code);
}

/**
 * Էջի նկարվելու հետ միաժամանակ սկսում է բեռնել զարդատառը (սերվերում՝ <link rel="preload"> գլխում,
 * բրաուզերում՝ անմիջապես)։ font-display: block-ի հետ մարդը երբեք չի տեսնում սովորական տառը թռչնատառի տեղում։
 */
export function preloadTrchnatar(letter: string) {
  const url = fileFor(letter);
  if (url) preload(url, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}

/**
 * Բրաուզերի ազատ պահին բեռնում է բոլոր 38 տառերը (~350 ԿԲ, մեկ անգամ, հետո cache-ից)։ Դրանից հետո ցանկացած
 * էջում զարդատառը հայտնվում է միանգամից։ «Տրաֆիկի խնայողություն» ռեժիմում չի բեռնում։
 */
export function warmTrchnatar() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const letters = String.fromCodePoint(...[...byCode.keys()]);
  void document.fonts.load(`16px "${FAMILY}"`, letters).catch(() => undefined);
}
