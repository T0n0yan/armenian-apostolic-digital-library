/*
 * Liquid glass-ի բեկումը (refraction)։
 * Ապակու եզրին ետևի պատկերը ծռվում է, ինչպես հաստ ապակու մեջ, իսկ գույները մի փոքր բաժանվում են։
 * Աշխատում է SVG ֆիլտրով (`backdrop-filter: url(#…)`), որը միայն Chromium-ն է հասկանում
 * (Chrome, Android-ի Telegram, Edge)։ Safari-ում, iOS-ում և Firefox-ում մնում է սովորական blur-ը։
 * Ամեն ապակե տարրի համար իր չափով «տեղաշարժի քարտեզ» է նկարվում (canvas), մեկ անգամ ամեն չափի համար։
 */

/**
 * Որ տարրերն են ստանում բեկումը. միայն երբ ետևի էջը կանգնած է (բաց մենյու, պատուհան՝ scroll-lock-ով)։
 * Scroll-ի ժամանակ ֆիլտրը ամեն կադր նորից է հաշվվում, իսկ հեռախոսում դա կտրտում է էջը
 * (տիրոջ որոշումը 2026-11-12, blur-ը նույն պատճառով է հանված)։
 */
export const LIQUID_SELECTOR = ".menu-panel[data-open], html[data-scroll-locked] .liquid-sheet";

type GlassShape = { width: number; height: number; radius: number };

/** Եզրի լայնությունը, որտեղ ապակին ծռում է պատկերը։ */
export function bezelWidth({ width, height }: GlassShape): number {
  return Math.max(6, Math.min(34, Math.min(width, height) * 0.34));
}

/**
 * Մեկ կետի տեղաշարժը [-1, 1] սահմաններում։ Եզրին՝ ամենաուժեղը, ներսում՝ 0։
 * Ուղղությունը դեպի կենտրոն է, որ եզրը «խոշորացնի» ետևի պատկերը և երբեք չվերցնի տարրից դուրսը։
 */
export function displacementAt(x: number, y: number, shape: GlassShape): [number, number] {
  const { width, height } = shape;
  const radius = Math.min(shape.radius, width / 2, height / 2);
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - (width / 2 - radius);
  const qy = Math.abs(py) - (height / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const distance = outside + Math.min(Math.max(qx, qy), 0) - radius;
  const depth = -distance;
  const bezel = bezelWidth(shape);
  if (depth <= 0 || depth >= bezel) return [0, 0];

  let nx: number;
  let ny: number;
  if (qx > 0 && qy > 0) {
    nx = qx / outside;
    ny = qy / outside;
  } else if (qx > qy) {
    nx = 1;
    ny = 0;
  } else {
    nx = 0;
    ny = 1;
  }
  nx *= Math.sign(px) || 1;
  ny *= Math.sign(py) || 1;

  // Կլոր ապակու կտրվածք. թեքությունը եզրին մեծ է, դեպի ներս արագ նվազում է։
  const t = depth / bezel;
  const strength = 1 - Math.sqrt(1 - (1 - t) * (1 - t));
  return [-nx * strength, -ny * strength];
}

const mapCache = new Map<string, string>();

/** Քարտեզը PNG-ով. R՝ x տեղաշարժ, G՝ y տեղաշարժ (128 = տեղում)։ */
function displacementMap(shape: GlassShape): string {
  const key = `${shape.width}x${shape.height}r${shape.radius}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(shape.width, shape.height);
  const data = image.data;
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      const [dx, dy] = displacementAt(x + 0.5, y + 0.5, shape);
      const index = (y * shape.width + x) * 4;
      data[index] = Math.round(128 + dx * 127);
      data[index + 1] = Math.round(128 + dy * 127);
      data[index + 2] = 128;
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (mapCache.size > 40) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

/** Բեկումը միայն Chromium-ում է աշխատում, և չենք միացնում, երբ մարդը խնդրել է քիչ թափանցիկություն/շարժում։ */
export function canRefract(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  const chromium = brands?.some((item) => /Chromium/i.test(item.brand))
    ?? (/\bChrome\/\d+/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
  if (!chromium) return false;
  if (window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (document.documentElement.dataset.motion === "reduced") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(memory !== undefined && memory < 3);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Ներսի blur-ը (px). մեծ պատուհաններում տեքստը պետք է կարդացվի, փոքր կոճակին՝ գրեթե մաքուր ապակի։ */
function innerBlur(shape: GlassShape): number {
  return Math.min(shape.width, shape.height) < 90 ? 2 : 5;
}

function buildFilter(id: string, shape: GlassShape, blur: number): SVGFilterElement {
  const map = displacementMap(shape);
  const scale = Math.round(bezelWidth(shape) * 2.4);
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(shape.width));
  filter.setAttribute("height", String(shape.height));
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  // Երեք գույնը տարբեր ուժով են ծռվում (chromatic aberration), հետո նորից գումարվում։
  const channels = [
    { scale, matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", out: "r" },
    { scale: Math.round(scale * 1.08), matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", out: "g" },
    { scale: Math.round(scale * 1.16), matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", out: "b" },
  ];
  filter.innerHTML = `
    <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="soft"/>
    <feImage href="${map}" x="0" y="0" width="${shape.width}" height="${shape.height}" preserveAspectRatio="none" result="map"/>
    ${channels.map((channel) => `
      <feDisplacementMap in="soft" in2="map" scale="${channel.scale}" xChannelSelector="R" yChannelSelector="G" result="d${channel.out}"/>
      <feColorMatrix in="d${channel.out}" type="matrix" values="${channel.matrix}" result="${channel.out}"/>`).join("")}
    <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
    <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>`;
  return filter;
}

/** Սկսում է հետևել էջի ապակե տարրերին. վերադարձնում է անջատող ֆունկցիա։ */
export function installLiquidGlass(): () => void {
  if (!canRefract()) return () => {};
  const root = document.documentElement;
  root.dataset.refract = "";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);

  let counter = 0;
  const tracked = new Map<Element, { id: string; key: string }>();

  const update = (element: HTMLElement) => {
    const entry = tracked.get(element);
    if (!entry) return;
    const width = Math.round(element.offsetWidth);
    const height = Math.round(element.offsetHeight);
    if (width < 8 || height < 8 || width * height > 1_600_000) {
      element.style.removeProperty("--lg-refract");
      return;
    }
    const style = getComputedStyle(element);
    const radius = Math.round(Math.min(parseFloat(style.borderTopLeftRadius) || 0, width / 2, height / 2));
    const shape = { width, height, radius };
    const blur = innerBlur(shape);
    const key = `${width}x${height}r${radius}b${blur}`;
    if (entry.key === key) return;
    entry.key = key;
    defs.querySelector(`#${entry.id}`)?.remove();
    defs.appendChild(buildFilter(entry.id, shape, blur));
    element.style.setProperty("--lg-refract", `url(#${entry.id})`);
  };

  const resizeObserver = new ResizeObserver((entries) => {
    for (const item of entries) update(item.target as HTMLElement);
  });

  const scan = () => {
    for (const [element, entry] of tracked) {
      if (element.isConnected && element.matches(LIQUID_SELECTOR)) continue;
      resizeObserver.unobserve(element);
      defs.querySelector(`#${entry.id}`)?.remove();
      (element as HTMLElement).style.removeProperty("--lg-refract");
      tracked.delete(element);
    }
    document.querySelectorAll<HTMLElement>(LIQUID_SELECTOR).forEach((element) => {
      if (tracked.has(element)) return;
      tracked.set(element, { id: `lg-refract-${++counter}`, key: "" });
      resizeObserver.observe(element);
    });
  };

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan(); });
  };
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-open", "data-scroll-locked"] });
  scan();

  return () => {
    cancelAnimationFrame(frame);
    mutationObserver.disconnect();
    resizeObserver.disconnect();
    for (const element of tracked.keys()) (element as HTMLElement).style.removeProperty("--lg-refract");
    tracked.clear();
    svg.remove();
    delete root.dataset.refract;
  };
}
