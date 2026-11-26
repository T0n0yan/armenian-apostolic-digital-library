// Եկեղեցու «անձնագիրը»՝ մոդելի ամբողջ նկարագրությունը տվյալներով (JSON)։ Այստեղից են կառուցվում 3D-ն և
// հատակագիծը։ Այս ֆայլում three.js չկա. հաշվարկները պարզ թվերով են, որ աշխատեն նաև սերվերում և SVG-ում։
// Առանցքներ (մետր)՝ x՝ հյուսիս (−) / հարավ (+), y՝ վեր, z՝ արևելք (−) / արևմուտք (+)։

import { PART_INFO, type PartKind } from "./info";

export type Pt = readonly [number, number];
export type V3 = readonly [number, number, number];
/** Հատակագծի կետ. երրորդ թիվը (եթե կա)՝ այս կետից սկսվող պատի կորությունը (մ, + դեպի դուրս)։ */
export type Vertex = readonly [number, number] | readonly [number, number, number];
export type OpeningShape = "arch" | "rect" | "round" | "slit" | "cross";

/** `edge`՝ պատի համարը (կետ i → i+1), `at`՝ կենտրոնը պատի սկզբից (մ)։ */
export type Door = { edge: number; at: number; w: number; h: number; part?: PartKind };
export type Window = { edge: number; at: number; y: number; w: number; h: number; shape?: OpeningShape; count?: number; gap?: number };

export type Room = {
  id: string;
  part?: PartKind;
  partAt?: V3;
  outline: readonly Vertex[];
  height: number;
  /** Առանձին պատերի բարձրություն (պատի համար → մ)։ */
  heights?: Readonly<Record<number, number>>;
  /** «flat»՝ հարթ առաստաղ, «open»՝ առաստաղը տալիս են կամարները և գմբեթը։ */
  ceiling: "flat" | "open";
  doors?: readonly Door[];
  windows?: readonly Window[];
  /** Կոր պատեր, որոնց վրա կիսագմբեթ (խորան) է։ */
  apses?: ReadonlyArray<{ edge: number; part?: PartKind }>;
};

/** Կամարի ծայրը՝ փակ (true) կամ փակ՝ բացվածքով (օր.՝ խորանի կամարի համար)։ */
export type Closure = true | { hole: number; rise: number };
export type Vault = { from: Pt; to: Pt; width: number; spring: number; rise?: number; closeFrom?: Closure; closeTo?: Closure };
/** Սյունաշար՝ կամարներով (եռանավ բազիլիկում նավերի միջև)։ `count`՝ սյուների թիվը (ծայրերը ներառյալ)։ */
export type Arcade = { from: Pt; to: Pt; count: number; spring: number; top: number; pillar: number };
export type BaySide = "x+" | "x-" | "z+" | "z-";
export type Dome = {
  at: Pt; radius: number; base: number; drum: number; sides: number;
  /** Գմբեթատակ քառակուսու կես-լայնությունը (առագաստներով)։ */
  bay?: number;
  /** Քառակուսու այն կողմերը, որտեղ կամարի փոխարեն պատ է։ */
  closed?: readonly BaySide[];
  windows?: { count: number; w: number; h: number; shape?: OpeningShape };
};
export type Roof = { type: "flat" } | { type: "gable"; axis: "x" | "z"; rise: number } | { type: "tent"; rise: number };
/** Արտաքին ծավալ (դրսի տեսքը)՝ պատեր `base`-ից `height`, վրան տանիք։ */
export type Mass = { outline: readonly Vertex[]; base?: number; height: number; roof: Roof };
/** Բեմ. ուրվագծի առաջին պատը (կետ 0 → 1) առջևի եզրն է։ */
export type Bema = { outline: readonly Vertex[]; height: number; stairs: "sides" | "center"; atyan?: { width: number; depth: number; height: number }; curtainTop: number };
export type Balcony = { outline: readonly Vertex[]; floor: number; part?: PartKind; stairs?: { at: Pt; dir: Pt; width: number } };
export type Belfry = { at: Pt; base: number; radius: number; columns: number; height: number };

export type ItemType =
  | "altar" | "lectern" | "font" | "candle-table" | "chandelier" | "choir" | "icon" | "bench" | "column"
  | "chalice" | "gospel" | "censer" | "fan" | "candlestick" | "procession-icon";
/** Պարագա. `rot`՝ աստիճան (0՝ դեմքով դեպի արևմուտք, 90՝ դեպի հարավ)։ */
export type Item = { type: ItemType; at: Pt; y?: number; rot?: number; w?: number; h?: number; top?: number; name?: string; niche?: boolean };

export type Camera = { eye: V3; look: V3 };
/** Մարդուկ՝ դերով (զգեստի գույնն ու ձևը)։ `rot`՝ աստիճան, ինչպես պարագաներինը։ */
export type Role = "priest" | "deacon" | "dpir" | "believer";
export type Person = { role: Role; at: V3; rot?: number };
export type TourStep = { title: string; text: string; part: PartKind; priest: V3; vested: boolean; curtainClosed: boolean; eye: V3; look: V3; people?: readonly Person[] };
export type TuffColor = "pink" | "ochre" | "gray" | "black";

export type ChurchModel = {
  version: 1;
  id: string;
  name: string;
  tuff: TuffColor;
  rooms: readonly Room[];
  vaults: readonly Vault[];
  arcades: readonly Arcade[];
  dome?: Dome;
  masses: readonly Mass[];
  bema?: Bema;
  balconies: readonly Balcony[];
  belfry?: Belfry;
  items: readonly Item[];
  /** Տեսախցիկի ձեռքով ընտրված տեղեր (մասի id կամ տեսակ → տեսք)։ */
  cameras?: Readonly<Record<string, Camera>>;
  tour?: readonly TourStep[];
};

// ---------- 2D հաշվարկներ ----------

const ARC_STEPS = 12;
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const length = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = length(a) || 1; return [a[0] / l, a[1] / l]; };
export const rotate = (a: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  // rot 0 → +z, rot 90 → +x (ինչպես three.js-ի rotateY-ը)
  return [a[0] * Math.cos(r) + a[1] * Math.sin(r), -a[0] * Math.sin(r) + a[1] * Math.cos(r)];
};

export function insidePolygon(points: readonly Pt[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

export type Edge = {
  index: number;
  a: Pt;
  b: Pt;
  bulge: number;
  /** Կոր պատի դեպի դուրս ուղղությունը (լարի նկատմամբ)։ */
  out: Pt;
  /** Պատի կետերը a-ից b (կոր պատը՝ 12 հատվածով)։ */
  pts: Pt[];
  /** Ամեն հատվածի նորմալը՝ դեպի սենյակի ներսը։ */
  inward: Pt[];
  /** Կուտակված երկարությունը ամեն կետում։ */
  cum: number[];
};

/** Ուրվագիծը → պատեր (կոր պատերը՝ կիսաէլիպսով)։ */
export function edgesOf(outline: readonly Vertex[]): Edge[] {
  const straight: Pt[] = outline.map((v) => [v[0], v[1]]);
  const n = straight.length;
  const raw = straight.map((a, index) => {
    const b = straight[(index + 1) % n];
    const bulge = outline[index][2] ?? 0;
    const u = unit(sub(b, a));
    let left: Pt = [-u[1], u[0]];
    const mid = mul(add(a, b), 0.5);
    if (insidePolygon(straight, mid[0] + left[0] * 0.02, mid[1] + left[1] * 0.02)) left = mul(left, -1);
    const out = left;
    const pts: Pt[] = [a];
    if (bulge) {
      const hw = length(sub(b, a)) / 2;
      for (let i = 1; i < ARC_STEPS; i++) {
        const t = i / ARC_STEPS;
        pts.push(add(add(mid, mul(u, -hw * Math.cos(Math.PI * t))), mul(out, bulge * Math.sin(Math.PI * t))));
      }
    }
    pts.push(b);
    return { index, a, b, bulge, out, pts };
  });
  const polygon = raw.flatMap((edge) => edge.pts.slice(0, -1));
  return raw.map((edge) => {
    const inward: Pt[] = [];
    const cum = [0];
    for (let i = 0; i < edge.pts.length - 1; i++) {
      const p = edge.pts[i];
      const q = edge.pts[i + 1];
      const d = unit(sub(q, p));
      let normal: Pt = [-d[1], d[0]];
      const m = mul(add(p, q), 0.5);
      if (!insidePolygon(polygon, m[0] + normal[0] * 0.02, m[1] + normal[1] * 0.02)) normal = mul(normal, -1);
      inward.push(normal);
      cum.push(cum[i] + length(sub(q, p)));
    }
    return { ...edge, inward, cum };
  });
}

/** Ուրվագծի բոլոր կետերը (կորերը՝ հատվածներով)՝ հատակի և SVG-ի համար։ */
export function polygonOf(outline: readonly Vertex[]): Pt[] {
  return edgesOf(outline).flatMap((edge) => edge.pts.slice(0, -1));
}

/** Պատի վրա `s` մետր հեռավորության կետը և այդտեղ ներս նայող նորմալը։ */
export function pointOnEdge(edge: Edge, s: number): { p: Pt; n: Pt } {
  const total = edge.cum[edge.cum.length - 1];
  const at = Math.min(Math.max(s, 0), total);
  let i = 0;
  while (i < edge.cum.length - 2 && edge.cum[i + 1] < at) i++;
  const span = edge.cum[i + 1] - edge.cum[i] || 1;
  const t = (at - edge.cum[i]) / span;
  const p = add(edge.pts[i], mul(sub(edge.pts[i + 1], edge.pts[i]), t));
  return { p, n: edge.inward[i] };
}

export function centroid(points: readonly Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cz = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    area += cross;
    cx += (p[0] + q[0]) * cross;
    cz += (p[1] + q[1]) * cross;
  });
  if (Math.abs(area) < 1e-6) return mul(points.reduce((s, p) => add(s, p), [0, 0] as Pt), 1 / points.length);
  return [cx / (3 * area), cz / (3 * area)];
}

export function bounds(points: readonly Pt[]) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export function modelBounds(model: ChurchModel) {
  return bounds(model.rooms.flatMap((room) => polygonOf(room.outline)));
}

/** Պատուհանի կամ դռան կենտրոնները պատի վրա (շարքը՝ `count`/`gap`-ով)։ */
export function openingCenters(opening: { at: number; count?: number; gap?: number }) {
  const count = Math.max(1, opening.count ?? 1);
  const gap = opening.gap ?? 2;
  return Array.from({ length: count }, (_, i) => opening.at + (i - (count - 1) / 2) * gap);
}

/** Արտաքին ծավալի տանիքի բարձրությունը տրված կետում (երկթեք տանիքի ճակատին՝ եռանկյան բարձրությունը)։ */
function massTopAt(mass: Mass, p: Pt) {
  if (mass.roof.type !== "gable") return mass.height;
  const box = bounds(polygonOf(mass.outline));
  const across = mass.roof.axis === "z" ? p[0] - (box.minX + box.maxX) / 2 : p[1] - (box.minZ + box.maxZ) / 2;
  const half = mass.roof.axis === "z" ? (box.maxX - box.minX) / 2 : (box.maxZ - box.minZ) / 2;
  const onGableEnd = mass.roof.axis === "z" ? Math.min(Math.abs(p[1] - box.minZ), Math.abs(p[1] - box.maxZ)) < 0.05 : Math.min(Math.abs(p[0] - box.minX), Math.abs(p[0] - box.maxX)) < 0.05;
  return onGableEnd ? mass.height + mass.roof.rise * Math.max(0, 1 - Math.abs(across) / half) : mass.height;
}

/**
 * Ներսի պատի կետից դեպի դուրս՝ արտաքին պատի ամենամոտ կետը, որտեղ y…y+h բարձրությունը տեղավորվում է։
 * Այսպես պատուհանն ու դուռը ինքնին հայտնվում են նաև դրսի տեսքում։
 */
export function exteriorHit(model: ChurchModel, p: Pt, dir: Pt, y: number, h: number): { p: Pt; n: Pt } | null {
  let best: { p: Pt; n: Pt; t: number } | null = null;
  for (const mass of model.masses) {
    if (y < (mass.base ?? 0) - 0.01 || mass.height <= (mass.base ?? 0)) continue;
    const poly = polygonOf(mass.outline);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const e = sub(b, a);
      const denom = dir[0] * e[1] - dir[1] * e[0];
      if (Math.abs(denom) < 1e-9) continue;
      const w = sub(a, p);
      const t = (w[0] * e[1] - w[1] * e[0]) / denom;
      const s = (w[0] * dir[1] - w[1] * dir[0]) / denom;
      if (t <= 0 || t > 3 || s < 0 || s > 1) continue;
      const hit = add(p, mul(dir, t));
      if (y + h > massTopAt(mass, hit) + 0.01) continue;
      if (!best || t < best.t) best = { p: hit, n: dir, t };
    }
  }
  return best ? { p: best.p, n: best.n } : null;
}

// ---------- Կետեր (hotspots) ----------

export type Hotspot = {
  id: string;
  kind: PartKind;
  name: string;
  view: "inside" | "outside";
  at: V3;
  eye: V3;
  look: V3;
  /** Պարագա է (կարելի է բացել մանրամասն դիտումով)։ */
  item?: Item;
  /** Կետը երևում է միայն այսքան մետրից մոտ։ */
  near?: number;
};

/** Բեմի առջևի եզրը՝ կենտրոն, երկարություն, լայնակի և դեպի ժողովուրդ ուղղություններ։ */
export function bemaFront(bema: Bema) {
  const [edge] = edgesOf(bema.outline);
  const u = unit(sub(edge.b, edge.a));
  return { mid: mul(add(edge.a, edge.b), 0.5), length: length(sub(edge.b, edge.a)), u, f: mul(edge.inward[0], -1) };
}

/** Պարագայի կետը (իր տեղից մի փոքր վեր) և դեմքի ուղղությունը։ */
export function itemAnchor(item: Item): { at: V3; front: Pt } {
  const front = rotate([0, 1], item.rot ?? 0);
  const y = item.y ?? 0;
  const lift: Record<ItemType, number> = {
    altar: 1.4, lectern: 1.4, font: 1.3, "candle-table": 1.2, chandelier: 0.1, choir: 1.4, icon: (item.h ?? 3) * 0.55, bench: 1.1, column: (item.h ?? 4) * 0.6,
    chalice: 0.4, gospel: 0.25, censer: 1.2, fan: 2.3, candlestick: 1.7, "procession-icon": 2.4,
  };
  return { at: [item.at[0], y + lift[item.type], item.at[1]], front };
}

const ITEM_KIND: Partial<Record<ItemType, PartKind>> = {
  altar: "seghan", lectern: "grakal", font: "avazan", "candle-table": "momakal", chandelier: "jah", choir: "das", icon: "patker", bench: "nstaran",
  chalice: "skih", gospel: "avetaran", censer: "burvar", fan: "kshots", candlestick: "ashtanak", "procession-icon": "tapori-patker",
};

/** Բոլոր կետերը՝ ամեն մեկը իր անունով, տեղով և տեսախցիկի տեղով։ Աշխատում է առանց three.js-ի։ */
export function computeHotspots(model: ChurchModel): Hotspot[] {
  const box = modelBounds(model);
  const center: Pt = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
  const size = Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
  const spots: Array<Omit<Hotspot, "id" | "name" | "view" | "eye" | "look" | "near"> & { front?: Pt; dist?: number; name?: string; eyeY?: number; look?: V3 }> = [];

  for (const room of model.rooms) {
    const edges = edgesOf(room.outline);
    if (room.part) {
      const c = centroid(polygonOf(room.outline));
      spots.push({ kind: room.part, at: room.partAt ?? [c[0], 1.8, c[1]] });
    }
    for (const apse of room.apses ?? []) {
      const edge = edges[apse.edge];
      const hw = length(sub(edge.b, edge.a)) / 2;
      const mid = mul(add(edge.a, edge.b), 0.5);
      const spring = room.heights?.[apse.edge] ?? room.height;
      const p = add(mid, mul(edge.out, edge.bulge * 0.5));
      // Խորանին նայում ենք նավից՝ մարդու աչքի մոտ բարձրությունից։
      spots.push({ kind: apse.part ?? "khoran", at: [p[0], spring + hw * 0.6, p[1]], front: mul(edge.out, -1), dist: 11, eyeY: 3.6, look: [p[0], spring * 0.55, p[1]] });
    }
    for (const door of room.doors ?? []) {
      if (!door.part) continue;
      const { p, n } = pointOnEdge(edges[door.edge], door.at);
      const hit = exteriorHit(model, p, mul(n, -1), 0, door.h);
      const q = hit?.p ?? p;
      spots.push({ kind: door.part, at: [q[0], door.h * 0.7, q[1]], front: mul(n, -1) });
    }
  }

  if (model.bema) {
    const { mid, length: len, u, f } = bemaFront(model.bema);
    const h = model.bema.height;
    const left = add(mid, mul(u, -len * 0.2));
    spots.push({ kind: "bem", at: [left[0] - f[0] * 0.6, h + 0.2, left[1] - f[1] * 0.6], front: f, dist: 7 });
    const side = add(mid, mul(u, len / 2 - 0.45));
    spots.push({ kind: "varaguyr", at: [side[0], h + 4, side[1]], front: f, dist: 8 });
    if (model.bema.atyan) {
      const a = add(add(mid, mul(f, model.bema.atyan.depth / 2)), mul(u, 1.4));
      spots.push({ kind: "atyan", at: [a[0], model.bema.atyan.height + 0.15, a[1]], front: f, dist: 5 });
    }
  }

  for (const balcony of model.balconies) {
    const c = centroid(polygonOf(balcony.outline));
    spots.push({ kind: balcony.part ?? "das-hark", at: [c[0], balcony.floor + 1, c[1]] });
  }

  if (model.dome) {
    const { at, base, drum, radius } = model.dome;
    spots.push({ kind: "gmbet", at: [at[0], base + drum + radius * 0.45, at[1]] });
    spots.push({ kind: "gmbet-durs", at: [at[0], base + drum + radius * 0.75, at[1]] });
  }
  if (model.belfry) {
    const { at, base, height } = model.belfry;
    spots.push({ kind: "zangakatun", at: [at[0], base + height * 0.6, at[1]] });
  }

  for (const item of model.items) {
    const kind = ITEM_KIND[item.type];
    if (!kind) continue;
    const anchor = itemAnchor(item);
    spots.push({ kind, at: anchor.at, front: anchor.front, name: item.name, item });
  }

  const seen = new Map<string, number>();
  return spots.map((spot) => {
    const info = PART_INFO[spot.kind];
    const count = seen.get(spot.kind) ?? 0;
    seen.set(spot.kind, count + 1);
    const id = count ? `${spot.kind}-${count + 1}` : spot.kind;
    const camera = model.cameras?.[id] ?? (count ? undefined : model.cameras?.[spot.kind]);
    const at = spot.at;
    let eye: V3;
    let look: V3 = at;
    if (info.view === "outside") {
      const d = unit([at[0] - center[0] + 0.55, at[2] - center[1] + 0.8]);
      eye = [at[0] + d[0] * size * 0.75, at[1] + size * 0.25, at[2] + d[1] * size * 0.75];
    } else if (info.camera === "below") {
      eye = [at[0] + 2, 1.8, at[2] + 6.4];
      look = [at[0], at[1] - 2, at[2]];
    } else if (info.camera === "front" && spot.front) {
      const dist = spot.dist ?? info.distance ?? 4;
      eye = [at[0] + spot.front[0] * dist, spot.eyeY ?? at[1] + dist * 0.35, at[2] + spot.front[1] * dist];
      look = spot.look ?? at;
    } else {
      const d = unit([at[0] - center[0] || 0.001, at[2] - center[1]]);
      eye = [at[0] + d[0] * 12, at[1] + 9, at[2] + d[1] * 12];
    }
    return { id, kind: spot.kind, name: spot.name ?? info.name, view: info.view, at, eye: camera?.eye ?? eye, look: camera?.look ?? look, item: spot.item, near: info.near };
  });
}

/** Ամբողջ եկեղեցու սկզբնական տեսքը (ներսից կամ դրսից)։ */
export function defaultView(model: ChurchModel, mode: "cutaway" | "outside"): Camera {
  const box = modelBounds(model);
  const c: V3 = [(box.minX + box.maxX) / 2, 4, (box.minZ + box.maxZ) / 2];
  const size = Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
  if (mode === "outside") return { eye: [c[0] + size * 1.1, size * 0.55, c[2] + size * 1.4], look: [c[0], 6, c[2]] };
  return { eye: [c[0] + size * 0.9, size * 1.05, c[2] + size * 1.15], look: c };
}
