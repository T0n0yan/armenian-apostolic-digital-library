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
/** Որմնախորշ՝ փոս պատի մեջ (`depth` մետր դեպի դուրս), կամարով կամ ուղիղ առաստաղով։ Ավազանը կարող է կանգնել ներսում։ */
export type Niche = { edge: number; at: number; w: number; h: number; depth: number; arch?: boolean };
/** `frame`՝ դրսի զարդը պատուհանի վրա՝ եռանկյուն ճակտոն կամ կամարաձև շրջանակ։ */
export type Window = { edge: number; at: number; y: number; w: number; h: number; shape?: OpeningShape; count?: number; gap?: number; frame?: "pediment" | "hood" };

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
  niches?: readonly Niche[];
  /** Կոր պատեր, որոնց վրա կիսագմբեթ (խորան) է։ */
  apses?: ReadonlyArray<{ edge: number; part?: PartKind }>;
  /** Պատեր, որոնք չեն կառուցվում (բաց կողմ կամ թաքցված պատ)։ */
  open?: readonly number[];
  /** Հարթ առաստաղի կտորներ `height`-ի վրա (օր.՝ խաչի անկյունների վրա, սյուներով դահլիճում)։ */
  ceilings?: ReadonlyArray<readonly Pt[]>;
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
  /** Գլխիկը՝ վեղարաձև (կոն), հովանոցաձև (ծալքավոր) կամ առանց գլխիկի։ */
  cap?: "cone" | "umbrella" | "none";
  /** Գլխիկի բարձրությունը՝ շառավղի մասերով (սովորաբար 0.95, Էջմիածնինը՝ բարձր)։ */
  capHeight?: number;
  /** Խաչը գագաթին (առանց նշելու՝ կա)։ */
  cross?: boolean;
  /** Թմբուկի նիստերին՝ կույր կամարներ (զարդ)։ */
  arcade?: boolean;
  /** Դրսի թմբուկը սկսվում է այս բարձրությունից (տանիքի մեջից), որ օդում չկախվի։ */
  drumFrom?: number;
  /** Հարթ առաստաղ թմբուկի շուրջը (առանց առագաստների գմբեթի համար)՝ այս ուրվագծով։ */
  collar?: readonly Pt[];
};
export type Roof =
  | { type: "flat" }
  | { type: "gable"; axis: "x" | "z"; rise: number }
  | { type: "tent"; rise: number; apex?: Pt }
  /** Միաթեք՝ `low` կողմը ցածր է։ */
  | { type: "shed"; axis: "x" | "z"; rise: number; low: "-" | "+" };
/** Արտաքին ծավալ (դրսի տեսքը)՝ պատեր `base`-ից `height`, վրան տանիք։ */
export type Mass = {
  outline: readonly Vertex[]; base?: number; height: number; roof: Roof;
  /** Բաց կամարներ ամեն պատի մեջտեղում (զանգակատան աշտարակի սրահ)։ */
  arches?: { w: number; h: number };
};
/** Բեմ. ուրվագծի առաջին պատը (կետ 0 → 1) առջևի եզրն է։ */
export type Bema = { outline: readonly Vertex[]; height: number; stairs: "sides" | "center"; atyan?: { width: number; depth: number; height: number }; curtainTop: number };
export type Balcony = { outline: readonly Vertex[]; floor: number; part?: PartKind; stairs?: { at: Pt; dir: Pt; width: number } };
/** Զանգակատուն՝ `tiers` հարկ սյուներով (վերևինները՝ մի քիչ նեղ)։ */
export type Belfry = {
  at: Pt; base: number; radius: number; columns: number; height: number; tiers?: number;
  /** Քառասյուն կամարավոր հիմքի բարձրությունը (0՝ չկա)։ */
  pavilion?: number;
  cross?: boolean;
};

export type ItemType =
  | "altar" | "lectern" | "font" | "candle-table" | "chandelier" | "choir" | "icon" | "bench" | "column"
  | "chalice" | "gospel" | "censer" | "fan" | "candlestick" | "procession-icon";
/** Պարագա. `rot`՝ աստիճան (0՝ դեմքով դեպի արևմուտք, 90՝ դեպի հարավ)։ */
export type Item = { type: ItemType; at: Pt; y?: number; rot?: number; w?: number; h?: number; top?: number; name?: string; niche?: boolean };

export type Camera = { eye: V3; look: V3 };
/** Մարդուկ՝ դերով (զգեստի գույնն ու ձևը)։ `rot`՝ աստիճան, ինչպես պարագաներինը։ */
export type Role = "priest" | "deacon" | "dpir" | "believer";
export type Person = { role: Role; at: V3; rot?: number };
export type TourStep = { title: string; text: string; part: PartKind; priest: V3; priestRot?: number; vested: boolean; curtainClosed: boolean; eye: V3; look: V3; people?: readonly Person[] };
export type TuffColor = "pink" | "ochre" | "gray" | "black";
/** Քարաշարը՝ միագույն, երկգույն «շախմատ» կամ երկգույն շերտեր։ */
export type Masonry = "plain" | "checker" | "bands";
export type RoofMaterial = "tile" | "stone";
/** Դրսի տեսքը. `plinth`՝ բազալտե հիմքի (ցոկոլի) բարձրությունը (0՝ չկա)։ */
export type ChurchLook = { accent?: TuffColor; masonry?: Masonry; plinth?: number; roof?: RoofMaterial; cornice?: boolean };

export type ChurchModel = {
  version: 1;
  id: string;
  name: string;
  tuff: TuffColor;
  look?: ChurchLook;
  rooms: readonly Room[];
  vaults: readonly Vault[];
  arcades: readonly Arcade[];
  dome?: Dome;
  domes?: readonly Dome[];
  masses: readonly Mass[];
  bema?: Bema;
  balconies: readonly Balcony[];
  belfry?: Belfry;
  belfries?: readonly Belfry[];
  items: readonly Item[];
  /** Տեսախցիկի ձեռքով ընտրված տեղեր (մասի id կամ տեսակ → տեսք)։ */
  cameras?: Readonly<Record<string, Camera>>;
  tour?: readonly TourStep[];
};

/** Բոլոր գմբեթները (հին `dome` և նոր `domes`)։ */
export const domesOf = (model: ChurchModel): Dome[] => [...(model.dome ? [model.dome] : []), ...(model.domes ?? [])];
export const belfriesOf = (model: ChurchModel): Belfry[] => [...(model.belfry ? [model.belfry] : []), ...(model.belfries ?? [])];

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

/** Բազմանկյան եզրագիծը `d` մետր դեպի դուրս (անկյուններում՝ սուր միացումով)։ */
export function offsetPolygon(points: readonly Pt[], d: number): Pt[] {
  let area = 0;
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; area += p[0] * q[1] - q[0] * p[1]; });
  const sign = area > 0 ? 1 : -1;
  const normal = (p: Pt, q: Pt): Pt => { const u = unit(sub(q, p)); return [sign * u[1], -sign * u[0]]; };
  return points.map((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    const k = Math.max(0.25, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + ((n1[0] + n2[0]) / k) * d, p[1] + ((n1[1] + n2[1]) / k) * d];
  });
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

/** Ամբողջ շենքի չափերը դրսից (ծավալներ, գմբեթներ, զանգակատներ)՝ սկզբնական տեսքի համար։ */
function outsideBounds(model: ChurchModel) {
  const box = bounds([...model.rooms.flatMap((room) => polygonOf(room.outline)), ...model.masses.flatMap((mass) => polygonOf(mass.outline))]);
  const top = Math.max(
    ...model.masses.map((m) => m.height + ("rise" in m.roof ? m.roof.rise : 0)),
    ...domesOf(model).map((d) => d.base + d.drum + d.radius * (0.33 + (d.capHeight ?? 0.95))),
    ...belfriesOf(model).map((b) => b.base + (b.pavilion ?? 0) + b.height * (b.tiers ?? 1) + 3),
    0,
  );
  return { ...box, top };
}

/** Պատուհանի կամ դռան կենտրոնները պատի վրա (շարքը՝ `count`/`gap`-ով)։ */
export function openingCenters(opening: { at: number; count?: number; gap?: number }) {
  const count = Math.max(1, opening.count ?? 1);
  const gap = opening.gap ?? 2;
  return Array.from({ length: count }, (_, i) => opening.at + (i - (count - 1) / 2) * gap);
}

/** Արտաքին ծավալի տանիքի բարձրությունը տրված կետում (երկթեք տանիքի ճակատին՝ եռանկյան բարձրությունը)։ */
function massTopAt(mass: Mass, p: Pt) {
  const roof = mass.roof;
  if (roof.type !== "gable" && roof.type !== "shed") return mass.height;
  const box = bounds(polygonOf(mass.outline));
  const across = roof.axis === "z" ? p[0] - (box.minX + box.maxX) / 2 : p[1] - (box.minZ + box.maxZ) / 2;
  const half = roof.axis === "z" ? (box.maxX - box.minX) / 2 : (box.maxZ - box.minZ) / 2;
  const onGableEnd = roof.axis === "z" ? Math.min(Math.abs(p[1] - box.minZ), Math.abs(p[1] - box.maxZ)) < 0.05 : Math.min(Math.abs(p[0] - box.minX), Math.abs(p[0] - box.maxX)) < 0.05;
  if (roof.type === "shed") {
    // Միաթեք. ցածր կողմից (0) մինչև բարձր կողմ (rise)։
    const t = Math.min(1, Math.max(0, (roof.low === "-" ? across + half : half - across) / (2 * half)));
    const highSide = Math.abs(Math.abs(across) - half) < 0.05 && t > 0.5;
    return onGableEnd || highSide ? mass.height + roof.rise * t : mass.height;
  }
  return onGableEnd ? mass.height + roof.rise * Math.max(0, 1 - Math.abs(across) / half) : mass.height;
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

  for (const { at, base, drum, radius } of domesOf(model)) {
    spots.push({ kind: "gmbet", at: [at[0], base + drum + radius * 0.45, at[1]] });
    spots.push({ kind: "gmbet-durs", at: [at[0], base + drum + radius * 0.75, at[1]] });
  }
  for (const { at, base, height, tiers } of belfriesOf(model)) {
    spots.push({ kind: "zangakatun", at: [at[0], base + 0.8 + height * (tiers ?? 1) * 0.6, at[1]] });
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
  if (mode === "outside") {
    // Բարձր շենքը (գմբեթ, զանգակատուն) ամբողջովին տեսադաշտում։
    const out = outsideBounds(model);
    const wide = Math.max(out.maxX - out.minX, out.maxZ - out.minZ, out.top * 1.15, size);
    const mid: V3 = [(out.minX + out.maxX) / 2, Math.max(6, out.top * 0.42), (out.minZ + out.maxZ) / 2];
    return { eye: [mid[0] + wide * 1.1, mid[1] + wide * 0.45, mid[2] + wide * 1.4], look: mid };
  }
  return { eye: [c[0] + size * 0.9, size * 1.05, c[2] + size * 1.15], look: c };
}

// ---------- «Պատարագից առաջ»՝ ցանկացած եկեղեցու համար ----------

/**
 * Քայլերը հաշվվում են եկեղեցու մասերից (մուտք, ավանդատուն, ատյան, բեմ, դաս), այնպես որ աշխատում են բոլոր
 * տիպերում։ Ավանդատուն չունեցող եկեղեցում զգեստավորման քայլերը բաց են թողնվում։ `model.tour`-ը (եթե կա) գերակա է։
 */
export function liturgyTour(model: ChurchModel): TourStep[] {
  if (model.tour) return [...model.tour];
  if (!model.bema) return [];
  const spots = computeHotspots(model);
  const spotOf = (kind: PartKind) => spots.find((spot) => spot.kind === kind);
  const { mid, length: len, u, f } = bemaFront(model.bema);
  const at = (along: number, forward: number, y: number): V3 => [mid[0] + u[0] * along + f[0] * forward, y, mid[1] + u[1] * along + f[1] * forward];
  const facingBema = (Math.atan2(-f[0], -f[1]) * 180) / Math.PI;
  const from = (p: V3, back = 5, up = 2.4): Pick<TourStep, "eye" | "look"> => ({
    eye: [p[0] + f[0] * back, p[1] + up, p[2] + f[1] * back],
    look: [p[0], p[1] + 1.2, p[2]],
  });
  const atyanY = model.bema.atyan?.height ?? 0;

  let entrance: V3 = at(0, 9, 0);
  for (const room of model.rooms) {
    const door = room.doors?.find((item) => item.part === "mutq");
    if (!door) continue;
    const { p, n } = pointOnEdge(edgesOf(room.outline)[door.edge], door.at);
    entrance = [p[0] + n[0] * 1.4, 0, p[1] + n[1] * 1.4];
  }
  const choir = model.items.find((item) => item.type === "choir");
  const dpirs: Person[] = choir
    ? [-0.9, 0, 0.9].map((x) => {
        const q = rotate([x, -0.1], choir.rot ?? 0);
        return { role: "dpir", at: [choir.at[0] + q[0], (choir.y ?? 0) + 0.15, choir.at[1] + q[1]], rot: choir.rot ?? 0 };
      })
    : [];
  const vestry = model.rooms.find((room) => room.part === "avandatun");
  const vestrySpot = spotOf("avandatun");
  const bemaSpot = spotOf("bem");
  const steps: TourStep[] = [{
    title: "Մուտք", part: "mutq", vested: false, curtainClosed: false, priestRot: facingBema,
    text: "Քահանան եկեղեցի է մտնում արևմտյան դռնով, խաչակնքվում է և խոնարհվում խորանի առջև։",
    priest: entrance, ...from(entrance, 5, 2.6),
  }];
  if (vestry && vestrySpot) {
    const c = centroid(polygonOf(vestry.outline));
    const p: V3 = [c[0], 0, c[1]];
    const view = { eye: vestrySpot.eye, look: vestrySpot.look };
    steps.push(
      {
        title: "Ավանդատուն", part: "avandatun", vested: false, curtainClosed: false, priest: p, priestRot: facingBema, ...view,
        text: "Նավով անցնում է առաջ և մտնում ավանդատուն, որտեղ պատրաստված են պատարագի զգեստները։",
      },
      {
        title: "Զգեստավորում", part: "avandatun", vested: true, curtainClosed: false, priest: p, priestRot: facingBema, ...view, people: dpirs,
        text: "Հագնում է պատարագի զգեստները՝ շապիկ, փորուրար, գոտի, բազպաններ, վակաս և շուրջառ, ամեն մեկի համար աղոթք ասելով։ Այդ ժամանակ դասը երգում է «Խորհուրդ խորին» շարականը։",
      },
    );
  }
  const washing = at(-Math.min(1.6, len / 2 - 0.8), 0.9, atyanY);
  const confession = at(0, 0.9, atyanY);
  const onBema = at(Math.min(1.4, len / 2 - 0.8), -1.2, model.bema.height);
  steps.push(
    {
      title: "Ձեռքերի լվացում", part: model.bema.atyan ? "atyan" : "bem", vested: true, curtainClosed: false, priest: washing, priestRot: facingBema, ...from(washing), people: dpirs,
      text: "Դուրս գալով՝ լվանում է ձեռքերը՝ ասելով 25-րդ սաղմոսը. «Լուացից ընդ անմեղս զձեռս իմ…»։",
    },
    {
      title: "Խոստովանություն", part: model.bema.atyan ? "atyan" : "bem", vested: true, curtainClosed: false, priest: confession, priestRot: facingBema, ...from(confession, 6), people: dpirs,
      text: "Բեմի առջև քահանան խոստովանում է ժողովրդի առաջ և խնդրում աղոթել իր համար։",
    },
    {
      title: "Բեմ բարձրանալը", part: "bem", vested: true, curtainClosed: true, priest: onBema, priestRot: facingBema,
      eye: bemaSpot?.eye ?? from(onBema, 8).eye, look: bemaSpot?.look ?? from(onBema).look, people: dpirs,
      text: "Բարձրանում է բեմ, վարագույրը փակվում է, և քահանան պատրաստում է ընծաները՝ հացը և գինին։",
    },
  );
  return steps;
}

// ---------- Մոմավառության սեղանի մոմերը ----------

export const CANDLE_SLOTS = 60;

/** Մոմի տեղը սեղանի վրա (իր տեղում)՝ [x, բարձրություն, z]։ 12 × 5 շարք, մի փոքր անկանոն՝ բնական տեսքի համար։ */
export function candleSlot(slot: number): V3 {
  const col = slot % 12;
  const row = Math.floor(slot / 12) % 5;
  const jitter = ((slot * 37) % 11) / 11 - 0.5;
  return [-0.6 + col * 0.109 + (row % 2) * 0.05 + jitter * 0.02, 0.17 + ((slot * 53) % 7) * 0.025, -0.27 + row * 0.135 + jitter * 0.02];
}

// ---------- Անձնագրի ստուգում (ադմինի խմբագրիչ, GPT-ից ներմուծում, բազայից կարդալ) ----------

const ITEM_TYPES: readonly ItemType[] = ["altar", "lectern", "font", "candle-table", "chandelier", "choir", "icon", "bench", "column", "chalice", "gospel", "censer", "fan", "candlestick", "procession-icon"];
const SHAPES: readonly OpeningShape[] = ["arch", "rect", "round", "slit", "cross"];
const TUFFS: readonly TuffColor[] = ["pink", "ochre", "gray", "black"];
const KINDS = Object.keys(PART_INFO) as PartKind[];

/**
 * Ստուգում է անձնագիրը. վերադարձնում է սխալները հայերեն՝ տեղով (օր.՝ «rooms[0].outline[3]»)։
 * Սահմանները պաշտպանում են և՛ բրաուզերը (չափազանց մեծ մոդել), և՛ բազան։
 */
/** Ստուգման օգնականները (օգտագործվում են նաև v2 բլոկների ստուգման մեջ, `blocks.ts`)։ */
export function makeChecker() {
  const errors: string[] = [];
  const fail = (path: string, what: string) => { if (errors.length < 30) errors.push(`${path}՝ ${what}`); };
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const num = (v: unknown, path: string, min = -150, max = 150) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(path, `պետք է թիվ լինի ${min}…${max} միջակայքում`);
  };
  const optNum = (v: unknown, path: string, min?: number, max?: number) => { if (v !== undefined) num(v, path, min, max); };
  const pt = (v: unknown, path: string) => {
    if (!Array.isArray(v) || v.length !== 2) return fail(path, "պետք է լինի [x, z]");
    num(v[0], `${path}[0]`); num(v[1], `${path}[1]`);
  };
  const v3 = (v: unknown, path: string) => {
    if (!Array.isArray(v) || v.length !== 3) return fail(path, "պետք է լինի [x, y, z]");
    v.forEach((n, i) => num(n, `${path}[${i}]`));
  };
  const list = (v: unknown, path: string, max: number, each: (item: unknown, path: string) => void, optional = false) => {
    if (v === undefined && optional) return;
    if (!Array.isArray(v)) return fail(path, "պետք է լինի ցուցակ […]");
    if (v.length > max) return fail(path, `առավելագույնը ${max} տարր`);
    v.forEach((item, i) => each(item, `${path}[${i}]`));
  };
  const outline = (v: unknown, path: string) => list(v, path, 64, (p, at) => {
    if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3)) return fail(at, "պետք է լինի [x, z] կամ [x, z, կորություն]");
    p.forEach((n, i) => num(n, `${at}[${i}]`));
  });
  const str = (v: unknown, path: string, max = 120, optional = true) => {
    if (v === undefined && optional) return;
    if (typeof v !== "string" || v.length > max) fail(path, `պետք է տեքստ լինի (մինչև ${max} նիշ)`);
  };
  const oneOf = <T extends string>(v: unknown, values: readonly T[], path: string, optional = false) => {
    if (v === undefined && optional) return;
    if (!values.includes(v as T)) fail(path, `պետք է լինի ${values.join(" / ")}`);
  };
  const closure = (v: unknown, path: string) => {
    if (v === undefined || v === true) return;
    if (!isObj(v)) return fail(path, "պետք է լինի true կամ { hole, rise }");
    num(v.hole, `${path}.hole`, 0, 30); num(v.rise, `${path}.rise`, 0, 30);
  };

  const flag = (v: unknown, path: string) => { if (v !== undefined && typeof v !== "boolean") fail(path, "պետք է լինի true կամ false"); };
  const dome = (d: unknown, path: string) => {
    if (!isObj(d)) return fail(path, "պետք է օբյեկտ լինի");
    pt(d.at, `${path}.at`); num(d.radius, `${path}.radius`, 0.5, 20); num(d.base, `${path}.base`, 1, 60); num(d.drum, `${path}.drum`, 0, 20);
    num(d.sides, `${path}.sides`, 4, 32); optNum(d.bay, `${path}.bay`, 0.5, 20); optNum(d.drumFrom, `${path}.drumFrom`, 0, 60);
    oneOf(d.cap, ["cone", "umbrella", "none"] as const, `${path}.cap`, true); optNum(d.capHeight, `${path}.capHeight`, 0.2, 4);
    flag(d.cross, `${path}.cross`); flag(d.arcade, `${path}.arcade`);
    list(d.closed, `${path}.closed`, 4, (side, at) => oneOf(side, ["x+", "x-", "z+", "z-"] as const, at), true);
    list(d.collar, `${path}.collar`, 120, (p, at) => pt(p, at), true);
    if (d.windows !== undefined) {
      if (!isObj(d.windows)) fail(`${path}.windows`, "պետք է օբյեկտ լինի");
      else { num(d.windows.count, `${path}.windows.count`, 0, 32); num(d.windows.w, `${path}.windows.w`, 0.1, 3); num(d.windows.h, `${path}.windows.h`, 0.1, 5); oneOf(d.windows.shape, SHAPES, `${path}.windows.shape`, true); }
    }
  };
  const belfry = (b: unknown, path: string) => {
    if (!isObj(b)) return fail(path, "պետք է օբյեկտ լինի");
    pt(b.at, `${path}.at`); num(b.base, `${path}.base`, 0, 60); num(b.radius, `${path}.radius`, 0.3, 6); num(b.columns, `${path}.columns`, 3, 16);
    num(b.height, `${path}.height`, 0.5, 10); optNum(b.tiers, `${path}.tiers`, 1, 4); optNum(b.pavilion, `${path}.pavilion`, 0, 10);
    flag(b.cross, `${path}.cross`);
  };
  const look = (v: unknown, path: string) => {
    if (v === undefined) return;
    if (!isObj(v)) return fail(path, "պետք է օբյեկտ լինի");
    oneOf(v.accent, TUFFS, `${path}.accent`, true); oneOf(v.masonry, ["plain", "checker", "bands"] as const, `${path}.masonry`, true);
    optNum(v.plinth, `${path}.plinth`, 0, 3); oneOf(v.roof, ["tile", "stone"] as const, `${path}.roof`, true); flag(v.cornice, `${path}.cornice`);
  };
  return { errors, fail, isObj, num, optNum, pt, v3, list, outline, str, oneOf, closure, dome, belfry, look, flag };
}

export function validateModel(input: unknown): { model: ChurchModel | null; errors: string[] } {
  const { errors, fail, isObj, num, optNum, pt, v3, list, outline, str, oneOf, closure, dome, belfry, look } = makeChecker();
  if (!isObj(input)) return { model: null, errors: ["Անձնագիրը պետք է լինի JSON օբյեկտ { … }"] };
  const m = input;
  if (m.version !== 1) fail("version", "պետք է լինի 1");
  str(m.id, "id", 60, false);
  str(m.name, "name", 120, false);
  oneOf(m.tuff, TUFFS, "tuff");
  look(m.look, "look");
  list(m.rooms, "rooms", 20, (room, path) => {
    if (!isObj(room)) return fail(path, "պետք է օբյեկտ լինի");
    str(room.id, `${path}.id`, 40, false);
    oneOf(room.part, KINDS, `${path}.part`, true);
    if (room.partAt !== undefined) v3(room.partAt, `${path}.partAt`);
    outline(room.outline, `${path}.outline`);
    if (Array.isArray(room.outline) && room.outline.length < 3) fail(`${path}.outline`, "նվազագույնը 3 կետ");
    num(room.height, `${path}.height`, 1, 40);
    if (room.heights !== undefined) {
      if (!isObj(room.heights)) fail(`${path}.heights`, "պետք է լինի { պատի համար: բարձրություն }");
      else for (const [key, value] of Object.entries(room.heights)) num(value, `${path}.heights.${key}`, 1, 40);
    }
    oneOf(room.ceiling, ["flat", "open"] as const, `${path}.ceiling`);
    const edges = Array.isArray(room.outline) ? room.outline.length : 0;
    const edge = (v: unknown, at: string) => num(v, at, 0, Math.max(0, edges - 1));
    list(room.doors, `${path}.doors`, 20, (door, at) => {
      if (!isObj(door)) return fail(at, "պետք է օբյեկտ լինի");
      edge(door.edge, `${at}.edge`); num(door.at, `${at}.at`, 0, 100); num(door.w, `${at}.w`, 0.3, 10); num(door.h, `${at}.h`, 0.5, 15);
      oneOf(door.part, KINDS, `${at}.part`, true);
    }, true);
    list(room.windows, `${path}.windows`, 60, (window, at) => {
      if (!isObj(window)) return fail(at, "պետք է օբյեկտ լինի");
      edge(window.edge, `${at}.edge`); num(window.at, `${at}.at`, 0, 100); num(window.y, `${at}.y`, 0, 40);
      num(window.w, `${at}.w`, 0.1, 6); num(window.h, `${at}.h`, 0.1, 8); oneOf(window.shape, SHAPES, `${at}.shape`, true);
      optNum(window.count, `${at}.count`, 1, 20); optNum(window.gap, `${at}.gap`, 0.2, 20);
      oneOf(window.frame, ["pediment", "hood"] as const, `${at}.frame`, true);
    }, true);
    list(room.niches, `${path}.niches`, 20, (niche, at) => {
      if (!isObj(niche)) return fail(at, "պետք է օբյեկտ լինի");
      edge(niche.edge, `${at}.edge`); num(niche.at, `${at}.at`, 0, 100); num(niche.w, `${at}.w`, 0.3, 8); num(niche.h, `${at}.h`, 0.5, 15);
      num(niche.depth, `${at}.depth`, 0.1, 3);
      if (niche.arch !== undefined && typeof niche.arch !== "boolean") fail(`${at}.arch`, "պետք է լինի true կամ false");
    }, true);
    list(room.apses, `${path}.apses`, 6, (apse, at) => {
      if (!isObj(apse)) return fail(at, "պետք է օբյեկտ լինի");
      edge(apse.edge, `${at}.edge`); oneOf(apse.part, KINDS, `${at}.part`, true);
    }, true);
    list(room.open, `${path}.open`, 64, (v, at) => edge(v, at), true);
    list(room.ceilings, `${path}.ceilings`, 16, (c, at) => list(c, at, 64, (p, a) => pt(p, a)), true);
  });
  list(m.vaults, "vaults", 30, (v, path) => {
    if (!isObj(v)) return fail(path, "պետք է օբյեկտ լինի");
    pt(v.from, `${path}.from`); pt(v.to, `${path}.to`); num(v.width, `${path}.width`, 0.5, 40); num(v.spring, `${path}.spring`, 0, 40);
    optNum(v.rise, `${path}.rise`, 0.1, 30); closure(v.closeFrom, `${path}.closeFrom`); closure(v.closeTo, `${path}.closeTo`);
  });
  list(m.arcades, "arcades", 20, (a, path) => {
    if (!isObj(a)) return fail(path, "պետք է օբյեկտ լինի");
    pt(a.from, `${path}.from`); pt(a.to, `${path}.to`); num(a.count, `${path}.count`, 2, 40);
    num(a.spring, `${path}.spring`, 0.5, 30); num(a.top, `${path}.top`, 1, 40); num(a.pillar, `${path}.pillar`, 0.1, 4);
  });
  if (m.dome !== undefined) dome(m.dome, "dome");
  list(m.domes, "domes", 8, dome, true);
  list(m.masses, "masses", 20, (mass, path) => {
    if (!isObj(mass)) return fail(path, "պետք է օբյեկտ լինի");
    outline(mass.outline, `${path}.outline`); optNum(mass.base, `${path}.base`, 0, 60); num(mass.height, `${path}.height`, 0, 60);
    const roof = mass.roof;
    if (!isObj(roof)) return fail(`${path}.roof`, "պետք է օբյեկտ լինի");
    oneOf(roof.type, ["flat", "gable", "tent", "shed"] as const, `${path}.roof.type`);
    if (roof.type === "gable" || roof.type === "shed") { oneOf(roof.axis, ["x", "z"] as const, `${path}.roof.axis`); num(roof.rise, `${path}.roof.rise`, 0, 30); }
    if (roof.type === "shed") oneOf(roof.low, ["-", "+"] as const, `${path}.roof.low`);
    if (mass.arches !== undefined) { if (!isObj(mass.arches)) fail(`${path}.arches`, "պետք է օբյեկտ լինի"); else { num(mass.arches.w, `${path}.arches.w`, 0.3, 20); num(mass.arches.h, `${path}.arches.h`, 0.5, 30); } }
    if (roof.type === "tent") { num(roof.rise, `${path}.roof.rise`, 0, 30); if (roof.apex !== undefined) pt(roof.apex, `${path}.roof.apex`); }
  });
  if (m.bema !== undefined) {
    const b = m.bema;
    if (!isObj(b)) fail("bema", "պետք է օբյեկտ լինի");
    else {
      outline(b.outline, "bema.outline"); num(b.height, "bema.height", 0, 4); oneOf(b.stairs, ["sides", "center"] as const, "bema.stairs");
      num(b.curtainTop, "bema.curtainTop", 1, 30);
      if (b.atyan !== undefined) {
        if (!isObj(b.atyan)) fail("bema.atyan", "պետք է օբյեկտ լինի");
        else { num(b.atyan.width, "bema.atyan.width", 0.5, 20); num(b.atyan.depth, "bema.atyan.depth", 0.3, 10); num(b.atyan.height, "bema.atyan.height", 0, 2); }
      }
    }
  }
  list(m.balconies, "balconies", 6, (b, path) => {
    if (!isObj(b)) return fail(path, "պետք է օբյեկտ լինի");
    outline(b.outline, `${path}.outline`); num(b.floor, `${path}.floor`, 1, 30); oneOf(b.part, KINDS, `${path}.part`, true);
    if (b.stairs !== undefined) {
      if (!isObj(b.stairs)) fail(`${path}.stairs`, "պետք է օբյեկտ լինի");
      else { pt(b.stairs.at, `${path}.stairs.at`); pt(b.stairs.dir, `${path}.stairs.dir`); num(b.stairs.width, `${path}.stairs.width`, 0.4, 5); }
    }
  });
  if (m.belfry !== undefined) belfry(m.belfry, "belfry");
  list(m.belfries, "belfries", 6, belfry, true);
  list(m.items, "items", 300, (item, path) => {
    if (!isObj(item)) return fail(path, "պետք է օբյեկտ լինի");
    oneOf(item.type, ITEM_TYPES, `${path}.type`); pt(item.at, `${path}.at`);
    optNum(item.y, `${path}.y`, 0, 40); optNum(item.rot, `${path}.rot`, -360, 360); optNum(item.w, `${path}.w`, 0.1, 10);
    optNum(item.h, `${path}.h`, 0.1, 20); optNum(item.top, `${path}.top`, 0, 60); str(item.name, `${path}.name`);
    if (item.niche !== undefined && typeof item.niche !== "boolean") fail(`${path}.niche`, "պետք է լինի true կամ false");
  });
  if (m.cameras !== undefined) {
    if (!isObj(m.cameras)) fail("cameras", "պետք է օբյեկտ լինի");
    else for (const [key, camera] of Object.entries(m.cameras).slice(0, 60)) {
      if (!isObj(camera)) { fail(`cameras.${key}`, "պետք է լինի { eye, look }"); continue; }
      v3(camera.eye, `cameras.${key}.eye`); v3(camera.look, `cameras.${key}.look`);
    }
  }
  if (m.tour !== undefined) fail("tour", "ձեռքով քայլերը առայժմ չեն ընդունվում (հաշվվում են ինքնին)");
  if (!errors.length && Array.isArray(m.rooms) && !m.rooms.length) fail("rooms", "պետք է լինի գոնե մեկ սենյակ");
  return { model: errors.length ? null : (m as unknown as ChurchModel), errors };
}
