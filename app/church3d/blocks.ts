// Եկեղեցու անձնագիր v2՝ բլոկներից (դահլիճ, խաչաձև կենտրոն, կլոր դահլիճ, խորան, գմբեթ, զանգակատուն, ազատ ձևեր)։
// Ամեն բլոկ ինքն է կառուցում և՛ ներսը, և՛ դուրսը նույն չափերից, այնպես որ դրանք միշտ համընկնում են։
// Կցված բլոկը (խորան, ավանդատուն, գավիթ, գմբեթ, զանգակատուն) դիրքը հաշվում է ծնողից. ոչինչ օդում չի կախվում։
// Արդյունքը՝ v1 ձևը (`ChurchModel`), որից կառուցվում են 3D-ն, հատակագիծը և կետերը (build.ts, model.ts)։
// Առանցքներ, ինչպես v1-ում՝ x՝ հյուսիս (−) / հարավ (+), z՝ արևելք (−) / արևմուտք (+)։

import type { PartKind } from "./info";
import {
  insidePolygon, makeChecker, offsetPolygon, polygonOf, edgesOf, bounds, validateModel,
  type Balcony, type BaySide, type Belfry, type Bema, type Camera, type ChurchLook, type ChurchModel, type Dome, type Door, type Item,
  type Mass, type Niche, type OpeningShape, type Pt, type Room, type Roof, type TuffColor, type Vault, type Window, type Arcade,
} from "./model";

export type Side = "east" | "west" | "north" | "south";
export const SIDES: readonly Side[] = ["west", "south", "east", "north"];
const SIDE_OUT: Record<Side, Pt> = { east: [0, -1], west: [0, 1], north: [-1, 0], south: [1, 0] };
const SIDE_BAY: Record<Side, BaySide> = { east: "z-", west: "z+", north: "x-", south: "x+" };
/** Պատի հաստությունը (ներսի և դրսի պատերի միջև)։ */
export const WALL = 0.4;

/** `wall`՝ պատի անունը (օր.՝ «west», «north-east», «s3»), `at`՝ շեղումը պատի մեջտեղից (մ, պատի ուղղությամբ)։ */
export type BlockDoor = { wall: string; at?: number; w: number; h: number; part?: PartKind };
export type BlockWindow = { wall: string; at?: number; y: number; w: number; h: number; shape?: OpeningShape; count?: number; gap?: number; frame?: "pediment" | "hood" };
export type BlockNiche = { wall: string; at?: number; w: number; h: number; depth: number; arch?: boolean };

type Base = {
  id: string;
  /** Մարդու համար անունը (ցուցակում)։ */
  name?: string;
  /** Ամբողջ բլոկը (իր կցվածներով) թաքցված է։ */
  hidden?: boolean;
  /** Թաքցված մասեր՝ «inside», «outside», «vault», «wall:<անուն>»։ */
  hide?: readonly string[];
};
type Openings = { doors?: readonly BlockDoor[]; windows?: readonly BlockWindow[]; niches?: readonly BlockNiche[] };
/** Կցում ծնողի պատին. `offset`՝ շեղումը պատի մեջտեղից։ */
/** `gap`՝ ծնողի պատից հեռավորությունը (օր.՝ խորանի հետևում կանգնած կցակառույց)։ */
type Attach = { parent?: string; wall?: string; offset?: number; gap?: number };
type Link = { link?: "door" | "arch" | "none"; linkW?: number; linkH?: number };

/** Դահլիճ (նավ, գավիթ, ավանդատուն). `length`՝ ծնողից դեպի դուրս (արմատինը՝ արևելք-արևմուտք)։ */
export type HallBlock = Base & Openings & Attach & Link & {
  kind: "hall";
  part?: PartKind;
  partAt?: readonly [number, number, number];
  /** Արմատի կենտրոնը։ */
  at?: Pt;
  width: number;
  length: number;
  height: number;
  ceiling: "vault" | "flat";
  roof: "gable" | "shed" | "tent" | "flat";
  rise?: number;
  /** Տանիքի կատարի ուղղությունը. «length»՝ երկայնքով, «width»՝ լայնքով։ */
  ridge?: "length" | "width";
  /** Եռանավ. կողքի նավերի լայնությունը, բարձրությունը և սյուների թիվը։ */
  aisles?: { width: number; height: number; columns: number };
};

/** Խաչաձև կենտրոն. `half`՝ կենտրոնական քառակուսու կեսը, `arms`՝ թևերի երկարությունը ամեն կողմ։ */
export type CrossBlock = Base & Openings & {
  kind: "cross";
  part?: PartKind;
  partAt?: readonly [number, number, number];
  at?: Pt;
  half: number;
  arms: Partial<Record<Side, number>>;
  height: number;
  /** Դրսից՝ խաչաձև կամ քառակուսի (անկյունները լցված)։ */
  outside: "cross" | "square";
  /** Անկախ սյուներով դահլիճ. ներսը քառակուսի է, խաչի անկյուններում՝ այս չափի սյուներ (Էջմիածնի տիպ)։ */
  piers?: number;
  rise?: number;
};

/** Կլոր/բազմանիստ դահլիճ. պատերը՝ «s1»…«sN» (s1-ը նայում է արևմուտք)։ */
export type RotundaBlock = Base & Openings & Attach & Link & {
  kind: "rotunda";
  part?: PartKind;
  at?: Pt;
  sides: number;
  radius: number;
  height: number;
  roof: "tent" | "flat";
  rise?: number;
};

/** Խորան՝ կիսաշրջան ծնողի պատի մեջ. դրսից թաքնված (ուղղանկյան մեջ) կամ երևացող (կլոր կամ նիստավոր)։ */
export type ApseBlock = Base & {
  kind: "apse";
  parent: string;
  wall: string;
  offset?: number;
  part?: PartKind;
  width: number;
  depth: number;
  outside: "hidden" | "round" | "faceted";
  /** Երևացող խորանի տանիքը՝ կիսակոն կամ հարթ (օր.՝ երբ վրան ռոտոնդա կա)։ */
  roof?: "cone" | "flat";
  windows?: ReadonlyArray<Omit<BlockWindow, "wall">>;
};

/** Գմբեթ՝ ծնողի վրա. `offset`՝ ծնողի կենտրոնից։ Հիմքը, առագաստները և դրսի թմբուկը հաշվվում են ինքնին։ */
export type DomeBlock = Base & {
  kind: "dome";
  parent: string;
  offset?: Pt;
  radius?: number;
  drum: number;
  sides: number;
  cap?: "cone" | "umbrella" | "none";
  /** Գլխիկի բարձրությունը շառավղի մասերով։ */
  capHeight?: number;
  /** Խաչը (առանց նշելու՝ կա, `false`՝ հանել)։ */
  cross?: boolean;
  /** Թմբուկի կույր կամարներ։ */
  arcade?: boolean;
  windows?: { count: number; w: number; h: number; shape?: OpeningShape };
};

/** Զանգակատուն՝ ծնողի տանիքին (offset) կամ առանձին (at, աշտարակով)։ */
export type BelfryBlock = Base & {
  kind: "belfry";
  parent?: string;
  offset?: Pt;
  at?: Pt;
  /** Առանձին կանգնածի աշտարակի բարձրությունը։ */
  tower?: number;
  radius: number;
  columns: number;
  height: number;
  tiers?: number;
  /** Քառասյուն կամարավոր հիմքի բարձրությունը։ */
  pavilion?: number;
  cross?: boolean;
  /** Ձեռքով տրված հիմքի բարձրություն (առանց դրա՝ տանիքի վրա)։ */
  y?: number;
  /** Աշտարակի կողմի երկարությունը և բաց կամարները ներքևում։ */
  towerSize?: number;
  porch?: { w: number; h: number };
};

/** Ազատ ձևեր (v1-ի պես)՝ այն ամենի համար, ինչ պատրաստի բլոկներով չի ստացվում («Բացել բլոկը»)։ */
export type FreeBlock = Base & {
  kind: "free";
  rooms?: readonly Room[];
  vaults?: readonly Vault[];
  arcades?: readonly Arcade[];
  masses?: readonly Mass[];
  domes?: readonly Dome[];
  belfries?: readonly Belfry[];
};

export type Block = HallBlock | CrossBlock | RotundaBlock | ApseBlock | DomeBlock | BelfryBlock | FreeBlock;
export type BlockKind = Block["kind"];

export type ChurchModelV2 = {
  version: 2;
  id: string;
  name: string;
  tuff: TuffColor;
  look?: ChurchLook;
  blocks: readonly Block[];
  bema?: Bema;
  balconies?: readonly Balcony[];
  items: readonly Item[];
  cameras?: Readonly<Record<string, Camera>>;
};
export type AnyChurchModel = ChurchModel | ChurchModelV2;

// ---------- Հաշվարկ ----------

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const rp = (p: Pt): Pt => [r2(p[0]), r2(p[1])];

/** Ուղղությունը → մոտակա կողմը։ */
function sideOf(v: Pt): Side {
  if (Math.abs(v[0]) > Math.abs(v[1])) return v[0] > 0 ? "south" : "north";
  return v[1] > 0 ? "west" : "east";
}

type Seg = { a: Pt; b: Pt; bulge: number; wall: string; height?: number };
type WallInfo = { a: Pt; b: Pt; out: Pt };
type Opening =
  | { type: "door"; p: Pt; wall: string; door: Omit<Door, "edge" | "at"> }
  | { type: "window"; p: Pt; wall: string; window: Omit<Window, "edge" | "at">; arcOffset?: number }
  | { type: "niche"; p: Pt; wall: string; niche: Omit<Niche, "edge" | "at"> };

/** Ներս ունեցող բլոկի հաշվարկը։ */
type Shell = {
  block: HallBlock | CrossBlock | RotundaBlock;
  center: Pt;
  segs: Seg[];
  walls: Map<string, WallInfo>;
  height: number;
  /** Թաքնված խորանների և դրանց կողքի ավանդատների ամենահեռու կետը ամեն կողմ (դրսի պատը մինչև այնտեղ է գալիս)։ */
  reach: Record<Side, number>;
  hiddenApse: Set<Side>;
  childReach: Array<{ side: Side; value: number }>;
  /** Խորանի լայնությունը պատի վրա (կամարի ծայրի բացվածքի համար)։ */
  apseOn: Map<string, number>;
  apses: Array<{ id: string; part: PartKind }>;
  openings: Opening[];
  domes: DomeBlock[];
  masses: Mass[];
  hidden: Set<string>;
  ceilings: Pt[][];
  /** Միայն դահլիճի համար՝ երկայնքի առանցքը։ */
  axis?: "x" | "z";
  rect?: { minX: number; maxX: number; minZ: number; maxZ: number };
  attached?: { out: Pt };
};

function wallPoint(wall: WallInfo, at = 0): Pt {
  return add(mul(add(wall.a, wall.b), 0.5), mul(unit(sub(wall.b, wall.a)), at));
}

/** Ուղղանկյան պատերը (ժամացույցի սլաքի ուղղությամբ)՝ արևմուտք, հարավ, արևելք, հյուսիս։ `splits`՝ ծայրի պատերի բաժանումը։ */
function rectSegs(r: { minX: number; maxX: number; minZ: number; maxZ: number }, splits?: { axis: "x" | "z"; at: readonly number[]; heights: readonly number[] }) {
  const corners: Record<Side, [Pt, Pt]> = {
    west: [[r.minX, r.maxZ], [r.maxX, r.maxZ]],
    south: [[r.maxX, r.maxZ], [r.maxX, r.minZ]],
    east: [[r.maxX, r.minZ], [r.minX, r.minZ]],
    north: [[r.minX, r.minZ], [r.minX, r.maxZ]],
  };
  const segs: Seg[] = [];
  const walls = new Map<string, WallInfo>();
  for (const side of SIDES) {
    const [a, b] = corners[side];
    walls.set(side, { a, b, out: SIDE_OUT[side] });
    const isEnd = splits && (splits.axis === "z" ? side === "west" || side === "east" : side === "north" || side === "south");
    if (!isEnd) { segs.push({ a, b, bulge: 0, wall: side }); continue; }
    // Ծայրի պատը՝ մասերով (եռանավում մեջտեղի մասը բարձր է)։
    const u = unit(sub(b, a));
    const total = len(sub(b, a));
    const cuts = splits.at.map((x) => total / 2 + (dot(u, splits.axis === "z" ? [1, 0] : [0, 1]) > 0 ? x : -x)).sort((p, q) => p - q);
    const points = [0, ...cuts, total];
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i + 1] - points[i] < 1e-6) continue;
      segs.push({ a: add(a, mul(u, points[i])), b: add(a, mul(u, points[i + 1])), bulge: 0, wall: side, height: splits.heights[i] });
    }
  }
  return { segs, walls };
}

/** Խաչաձև ուրվագիծ (ինչպես v1 ձևանմուշում)։ */
function crossSegs(c: Pt, s: number, arms: Record<Side, number>) {
  const L = arms;
  const raw: Array<{ p: Pt; wall: string }> = [
    { p: [-s, s + L.west], wall: "west" },
    { p: [s, s + L.west], wall: "west-south" },
    { p: [s, s], wall: "south-west" },
    { p: [s + L.south, s], wall: "south" },
    { p: [s + L.south, -s], wall: "south-east" },
    { p: [s, -s], wall: "east-south" },
    { p: [s, -s - L.east], wall: "east" },
    { p: [-s, -s - L.east], wall: "east-north" },
    { p: [-s, -s], wall: "north-east" },
    { p: [-s - L.north, -s], wall: "north" },
    { p: [-s - L.north, s], wall: "north-west" },
    { p: [-s, s], wall: "west-north" },
  ];
  // Զրո երկարությամբ թևի կողքի պատերը վերանում են (կրկնվող կետեր)։
  const pts: Array<{ p: Pt; wall: string }> = [];
  for (const point of raw) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev.p[0] - point.p[0]) < 1e-6 && Math.abs(prev.p[1] - point.p[1]) < 1e-6) { prev.wall = point.wall; continue; }
    pts.push({ ...point });
  }
  if (pts.length > 1 && len(sub(pts[0].p, pts[pts.length - 1].p)) < 1e-6) pts.pop();
  const segs: Seg[] = [];
  const walls = new Map<string, WallInfo>();
  pts.forEach((point, i) => {
    const a = add(point.p, c);
    const b = add(pts[(i + 1) % pts.length].p, c);
    segs.push({ a, b, bulge: 0, wall: point.wall });
  });
  for (const seg of segs) {
    const u = unit(sub(seg.b, seg.a));
    let out: Pt = [-u[1], u[0]];
    const mid = mul(add(seg.a, seg.b), 0.5);
    if (insidePolygon(segs.map((x) => x.a), mid[0] + out[0] * 0.05, mid[1] + out[1] * 0.05)) out = mul(out, -1);
    walls.set(seg.wall, { a: seg.a, b: seg.b, out });
  }
  return { segs, walls };
}

/** Տանիքի բարձրությունը տրված կետում (զանգակատունը դնելու համար)։ */
function roofTopAt(masses: readonly Mass[], p: Pt) {
  let top = 0;
  for (const mass of masses) {
    const poly = polygonOf(mass.outline);
    if (!insidePolygon(poly, p[0], p[1])) continue;
    const box = bounds(poly);
    const roof = mass.roof;
    let y = mass.height;
    if (roof.type === "gable" || roof.type === "shed") {
      const across = roof.axis === "z" ? p[0] - (box.minX + box.maxX) / 2 : p[1] - (box.minZ + box.maxZ) / 2;
      const half = roof.axis === "z" ? (box.maxX - box.minX) / 2 : (box.maxZ - box.minZ) / 2;
      y += roof.type === "gable" ? roof.rise * Math.max(0, 1 - Math.abs(across) / half) : roof.rise * Math.min(1, Math.max(0, (roof.low === "-" ? across + half : half - across) / (2 * half)));
    } else if (roof.type === "tent") {
      const apex = roof.apex ?? [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
      const reach = Math.max(...poly.map((q) => len(sub(q, apex)))) || 1;
      y += roof.rise * Math.max(0, 1 - len(sub(p, apex)) / reach);
    }
    top = Math.max(top, y);
  }
  return top;
}

const hasHide = (block: Base, key: string) => block.hide?.includes(key) ?? false;

/** v2 → v1 ձև. `errors`՝ բլոկների սխալները հայերեն (անհայտ ծնող, անհայտ պատ…)։ */
export function compileModel(model: ChurchModelV2): { model: ChurchModel; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(model.blocks.map((block) => [block.id, block]));
  const shells = new Map<string, Shell>();
  const rooms: Room[] = [];
  const vaults: Vault[] = [];
  const arcades: Arcade[] = [];
  const masses: Mass[] = [];
  const domes: Dome[] = [];
  const belfries: Belfry[] = [];
  const pendingBelfries: BelfryBlock[] = [];
  const extraItems: Item[] = [];

  // Թաքցվածները՝ կցվածների հետ միասին։
  const hiddenIds = new Set<string>();
  const isHidden = (block: Block): boolean => {
    if (block.hidden) return true;
    const parent = "parent" in block && block.parent ? byId.get(block.parent) : undefined;
    return parent ? isHidden(parent) : false;
  };
  for (const block of model.blocks) if (isHidden(block)) hiddenIds.add(block.id);

  // Կարգը՝ ծնողը միշտ կցվածից առաջ։
  const order: Block[] = [];
  const placed = new Set<string>();
  for (let guard = 0; guard < model.blocks.length + 1 && order.length < model.blocks.length; guard++) {
    for (const block of model.blocks) {
      if (placed.has(block.id)) continue;
      const parent = "parent" in block ? block.parent : undefined;
      if (parent && !byId.has(parent)) { errors.push(`${block.id}՝ ծնողը («${parent}») չկա`); placed.add(block.id); continue; }
      if (parent && !placed.has(parent)) continue;
      placed.add(block.id);
      order.push(block);
    }
  }
  if (order.length + errors.length < model.blocks.length) errors.push("բլոկների կցումը շրջան է կազմում (A→B→A)");

  const parentShell = (block: { id: string; parent?: string }) => {
    const shell = block.parent ? shells.get(block.parent) : undefined;
    if (block.parent && !shell) errors.push(`${block.id}՝ «${block.parent}»-ը պատեր չունի (պետք է լինի դահլիճ, խաչաձև կամ կլոր)`);
    return shell;
  };
  const wallOf = (shell: Shell, name: string, who: string) => {
    const wall = shell.walls.get(name);
    if (!wall) errors.push(`${who}՝ «${shell.block.id}»-ը «${name}» պատ չունի (կա՝ ${[...shell.walls.keys()].join(", ")})`);
    return wall;
  };
  const addOpenings = (shell: Shell, block: Openings) => {
    for (const door of block.doors ?? []) {
      const wall = wallOf(shell, door.wall, block === shell.block ? shell.block.id : "դուռ");
      if (wall) shell.openings.push({ type: "door", wall: door.wall, p: wallPoint(wall, door.at), door: { w: door.w, h: door.h, ...(door.part ? { part: door.part } : {}) } });
    }
    for (const window of block.windows ?? []) {
      const wall = wallOf(shell, window.wall, shell.block.id);
      const { wall: _wall, at: _at, ...rest } = window;
      if (wall) shell.openings.push({ type: "window", wall: window.wall, p: wallPoint(wall, window.at), window: rest });
    }
    for (const niche of block.niches ?? []) {
      const wall = wallOf(shell, niche.wall, shell.block.id);
      const { wall: _wall, at: _at, ...rest } = niche;
      if (wall) shell.openings.push({ type: "niche", wall: niche.wall, p: wallPoint(wall, niche.at), niche: rest });
    }
  };
  const newShell = (block: Shell["block"], center: Pt, built: { segs: Seg[]; walls: Map<string, WallInfo> }, height: number): Shell => ({
    block, center, segs: built.segs, walls: built.walls, height,
    reach: { east: -Infinity, west: -Infinity, north: -Infinity, south: -Infinity }, hiddenApse: new Set(), childReach: [], apseOn: new Map(), apses: [], openings: [], domes: [], masses: [], ceilings: [],
    hidden: new Set((block.hide ?? []).filter((key) => key.startsWith("wall:")).map((key) => key.slice(5))),
  });
  /** Կցված բլոկի դիրքը. ծնողի պատից WALL հեռավորության վրա, `width` պատի երկայնքով, `depth` դեպի դուրս։ */
  const attachRect = (block: Attach & { id: string }, width: number, depth: number) => {
    const parent = parentShell({ id: block.id, parent: block.parent });
    if (!parent) return null;
    const wall = wallOf(parent, block.wall ?? "", block.id);
    if (!wall) return null;
    const u = unit(sub(wall.b, wall.a));
    const c = wallPoint(wall, block.offset);
    const p0 = add(c, mul(wall.out, WALL + (block.gap ?? 0)));
    const corners = [add(p0, mul(u, -width / 2)), add(p0, mul(u, width / 2)), add(add(p0, mul(u, width / 2)), mul(wall.out, depth)), add(add(p0, mul(u, -width / 2)), mul(wall.out, depth))];
    const box = bounds(corners);
    return { parent, wall, c, box, out: wall.out, axis: (Math.abs(wall.out[0]) > Math.abs(wall.out[1]) ? "x" : "z") as "x" | "z" };
  };
  const link = (parent: Shell, child: Shell, block: Link & { id: string; wall?: string }, c: Pt, out: Pt, width: number, height: number) => {
    const kind = block.link ?? "door";
    if (kind === "none") return;
    const w = block.linkW ?? (kind === "arch" ? Math.max(0.8, width - 1) : Math.min(1.4, width - 0.6));
    const h = block.linkH ?? (kind === "arch" ? Math.max(2, Math.min(height, parent.height) - 1) : Math.min(2.6, height - 0.4));
    parent.openings.push({ type: "door", wall: block.wall ?? "", p: c, door: { w, h } });
    child.openings.push({ type: "door", wall: sideOf(mul(out, -1)), p: add(c, mul(out, WALL)), door: { w, h } });
  };

  for (const block of order) {
    const hidden = hiddenIds.has(block.id);
    if (block.kind === "hall") {
      let rect: { minX: number; maxX: number; minZ: number; maxZ: number };
      let axis: "x" | "z" = "z";
      let attached: ReturnType<typeof attachRect> = null;
      if (block.parent) {
        attached = attachRect(block, block.width, block.length);
        if (!attached) continue;
        rect = attached.box;
        axis = attached.axis;
      } else {
        const [x, z] = block.at ?? [0, 0];
        rect = { minX: x - block.width / 2, maxX: x + block.width / 2, minZ: z - block.length / 2, maxZ: z + block.length / 2 };
      }
      const nave = block.aisles ? Math.max(1, block.width - 2 * block.aisles.width) : 0;
      const wallHeight = block.aisles ? block.aisles.height : block.height;
      const built = rectSegs(rect, block.aisles ? { axis, at: [-nave / 2, nave / 2], heights: [wallHeight, block.height, wallHeight] } : undefined);
      const shell = newShell(block, [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2], built, wallHeight);
      shell.axis = axis;
      shell.rect = rect;
      if (attached) shell.attached = { out: attached.out };
      if (!hidden) shells.set(block.id, shell);
      else continue;
      addOpenings(shell, block);
      if (attached) {
        link(attached.parent, shell, block, attached.c, attached.out, block.width, block.height);
        const side = sideOf(attached.out);
        const far = Math.max(...[[rect.minX, rect.minZ], [rect.maxX, rect.maxZ]].map((p) => dot(p as unknown as Pt, attached!.out)));
        if (block.height <= attached.parent.height) attached.parent.childReach.push({ side, value: far });
      }
      continue;
    }
    if (block.kind === "cross") {
      const c = block.at ?? [0, 0];
      const arms: Record<Side, number> = { east: 0, west: 0, north: 0, south: 0, ...block.arms };
      const s0 = block.half;
      // Սյուներով՝ ներսը քառակուսի (կողմերը՝ ամենաերկար թևերով), պատերը՝ կողմերի անուններով։
      const built = block.piers
        ? rectSegs({ minX: c[0] - s0 - arms.north, maxX: c[0] + s0 + arms.south, minZ: c[1] - s0 - arms.east, maxZ: c[1] + s0 + arms.west })
        : crossSegs(c, s0, arms);
      const shell = newShell(block, c, built, block.height);
      if (block.piers && !hidden) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          extraItems.push({ type: "column", at: rp([c[0] + sx * s0, c[1] + sz * s0]), w: block.piers, h: block.height });
          const lx = sx > 0 ? arms.south : arms.north;
          const lz = sz > 0 ? arms.west : arms.east;
          if (lx > 0 && lz > 0) shell.ceilings.push([rp([c[0] + sx * s0, c[1] + sz * s0]), rp([c[0] + sx * (s0 + lx), c[1] + sz * s0]), rp([c[0] + sx * (s0 + lx), c[1] + sz * (s0 + lz)]), rp([c[0] + sx * s0, c[1] + sz * (s0 + lz)])]);
        }
      }
      if (hidden) continue;
      shells.set(block.id, shell);
      addOpenings(shell, block);
      continue;
    }
    if (block.kind === "rotunda") {
      let c: Pt = block.at ?? [0, 0];
      let attached: ReturnType<typeof attachRect> = null;
      const apothem = block.radius * Math.cos(Math.PI / block.sides);
      if (block.parent) {
        attached = attachRect(block, apothem * 2, apothem * 2);
        if (!attached) continue;
        c = [(attached.box.minX + attached.box.maxX) / 2, (attached.box.minZ + attached.box.maxZ) / 2];
      }
      const segs: Seg[] = [];
      const walls = new Map<string, WallInfo>();
      const n = block.sides;
      const corner = (i: number): Pt => { const f = -Math.PI / n + (2 * Math.PI * i) / n; return [c[0] + block.radius * Math.sin(f), c[1] + block.radius * Math.cos(f)]; };
      for (let i = 0; i < n; i++) {
        const a = corner(i);
        const b = corner(i + 1);
        const mid = mul(add(a, b), 0.5);
        segs.push({ a, b, bulge: 0, wall: `s${i + 1}` });
        walls.set(`s${i + 1}`, { a, b, out: unit(sub(mid, c)) });
      }
      const shell = newShell(block, c, { segs, walls }, block.height);
      if (hidden) continue;
      shells.set(block.id, shell);
      addOpenings(shell, block);
      if (attached) {
        // Կլոր դահլիճի ծնողին նայող պատը։
        const facing = [...walls.entries()].reduce((best, entry) => dot(entry[1].out, attached!.out) < dot(best[1].out, attached!.out) ? entry : best);
        const kind = block.link ?? "door";
        if (kind !== "none") {
          const w = block.linkW ?? (kind === "arch" ? 2.4 : 1.4);
          const h = block.linkH ?? (kind === "arch" ? Math.min(block.height, attached.parent.height) - 1 : 2.6);
          attached.parent.openings.push({ type: "door", wall: block.wall ?? "", p: attached.c, door: { w, h } });
          shell.openings.push({ type: "door", wall: facing[0], p: wallPoint(facing[1]), door: { w, h } });
        }
      }
      continue;
    }
    if (block.kind === "apse") {
      if (hidden) continue;
      const parent = parentShell(block);
      if (!parent) continue;
      const wall = wallOf(parent, block.wall, block.id);
      if (!wall) continue;
      const u = unit(sub(wall.b, wall.a));
      const c = wallPoint(wall, block.offset);
      const p1 = add(c, mul(u, -block.width / 2));
      const p2 = add(c, mul(u, block.width / 2));
      const index = parent.segs.findIndex((seg) => seg.wall === block.wall && dot(sub(c, seg.a), unit(sub(seg.b, seg.a))) >= -1e-6 && dot(sub(c, seg.a), unit(sub(seg.b, seg.a))) <= len(sub(seg.b, seg.a)) + 1e-6);
      if (index < 0) { errors.push(`${block.id}՝ «${block.wall}» պատին խորանի տեղ չկա`); continue; }
      const seg = parent.segs[index];
      const s1 = dot(sub(p1, seg.a), unit(sub(seg.b, seg.a)));
      const s2 = dot(sub(p2, seg.a), unit(sub(seg.b, seg.a)));
      if (s1 < -1e-3 || s2 > len(sub(seg.b, seg.a)) + 1e-3) { errors.push(`${block.id}՝ խորանը (${block.width} մ) պատից լայն է`); continue; }
      const pieces: Seg[] = [];
      if (s1 > 1e-3) pieces.push({ ...seg, b: p1 });
      pieces.push({ a: p1, b: p2, bulge: block.depth, wall: block.id, height: seg.height });
      if (len(sub(seg.b, seg.a)) - s2 > 1e-3) pieces.push({ ...seg, a: p2 });
      parent.segs.splice(index, 1, ...pieces);
      parent.apseOn.set(block.wall, Math.max(parent.apseOn.get(block.wall) ?? 0, block.width));
      parent.apses.push({ id: block.id, part: block.part ?? "khoran" });
      for (const window of block.windows ?? []) {
        const { at, ...rest } = window;
        parent.openings.push({ type: "window", wall: block.id, p: c, window: rest, arcOffset: at ?? 0 });
      }
      const side = sideOf(wall.out);
      if (block.outside === "hidden") {
        parent.hiddenApse.add(side);
        parent.reach[side] = Math.max(parent.reach[side], dot(add(c, mul(wall.out, block.depth)), wall.out));
      } else if (!hasHide(block, "outside")) {
        // Երևացող խորան՝ իր պատերով և կիսակոն տանիքով, մեջքով մտնում է ծնողի պատի մեջ։
        const a = add(add(p1, mul(u, -WALL)), mul(wall.out, WALL * 0.5));
        const b = add(add(p2, mul(u, WALL)), mul(wall.out, WALL * 0.5));
        const back = mul(wall.out, -WALL);
        const r = block.width / 2 + WALL;
        const d = block.depth + WALL * 0.5;
        const outline: Array<readonly [number, number] | readonly [number, number, number]> = block.outside === "round"
          ? [[...rp(a), d], rp(b), rp(add(b, back)), rp(add(a, back))]
          : [rp(a), ...[1, 2, 3, 4].map((i) => {
              const t = (Math.PI * i) / 5;
              const mid = mul(add(a, b), 0.5);
              return rp(add(add(mid, mul(u, -r * Math.cos(t))), mul(wall.out, d * Math.sin(t))));
            }), rp(b), rp(add(b, back)), rp(add(a, back))];
        parent.masses.push({ outline, height: r2(parent.height + WALL * 0.5), roof: block.roof === "flat" ? { type: "flat" } : { type: "tent", rise: r2(block.width / 2 + WALL), apex: rp(mul(add(a, b), 0.5)) } });
      }
      continue;
    }
    if (block.kind === "dome") {
      if (hidden) continue;
      const parent = parentShell(block);
      if (!parent) continue;
      parent.domes.push(block);
      continue;
    }
    if (block.kind === "belfry") {
      if (!hidden) pendingBelfries.push(block);
      continue;
    }
    if (block.kind === "free") {
      if (hidden) continue;
      rooms.push(...(block.rooms ?? []));
      vaults.push(...(block.vaults ?? []));
      arcades.push(...(block.arcades ?? []));
      masses.push(...(block.masses ?? []));
      domes.push(...(block.domes ?? []));
      belfries.push(...(block.belfries ?? []));
    }
  }

  // Ամեն ներս ունեցող բլոկ → սենյակ, կամարներ, գմբեթներ, դրսի ծավալներ։
  for (const shell of shells.values()) {
    const block = shell.block;
    const H = shell.height;
    const segs = shell.segs;
    const outline = segs.map((seg) => (seg.bulge ? [...rp(seg.a), r2(seg.bulge)] as const : rp(seg.a)));
    const edges = edgesOf(outline);
    const doors: Door[] = [];
    const windows: Window[] = [];
    const niches: Niche[] = [];
    for (const opening of shell.openings) {
      const index = segs.findIndex((seg) => {
        if (seg.wall !== opening.wall) return false;
        if (seg.bulge) return true;
        const u = unit(sub(seg.b, seg.a));
        const s = dot(sub(opening.p, seg.a), u);
        return s >= -1e-3 && s <= len(sub(seg.b, seg.a)) + 1e-3;
      });
      if (index < 0) { errors.push(`${block.id}՝ «${opening.wall}» պատի բացվածքը պատի վրա չի ընկնում`); continue; }
      const seg = segs[index];
      const total = edges[index].cum[edges[index].cum.length - 1];
      // Կոր պատի (խորանի) պատուհանները՝ աղեղի մեջտեղից։
      const at = opening.type === "window" && opening.arcOffset !== undefined ? total / 2 + opening.arcOffset : dot(sub(opening.p, seg.a), unit(sub(seg.b, seg.a)));
      const clamped = r2(Math.min(Math.max(at, 0), total));
      if (opening.type === "door") doors.push({ edge: index, at: clamped, ...opening.door });
      if (opening.type === "window") windows.push({ edge: index, at: clamped, ...opening.window });
      if (opening.type === "niche") niches.push({ edge: index, at: clamped, ...opening.niche });
    }
    const heights: Record<number, number> = {};
    segs.forEach((seg, i) => { if (seg.height !== undefined && seg.height !== H) heights[i] = seg.height; });
    const open = segs.map((seg, i) => (shell.hidden.has(seg.wall) ? i : -1)).filter((i) => i >= 0);
    const apses = segs.map((seg, i) => ({ i, apse: shell.apses.find((a) => a.id === seg.wall) })).filter((x) => x.apse).map((x) => ({ edge: x.i, part: x.apse!.part }));
    const polygon = polygonOf(outline);

    // Գմբեթի հիմքը և առագաստները՝ ծնողի տեսակից։
    const domeSpecs = shell.domes.map((d) => {
      const at = add(shell.center, d.offset ?? [0, 0]);
      if (block.kind === "cross") {
        const s = block.half;
        const arms: Record<Side, number> = { east: 0, west: 0, north: 0, south: 0, ...block.arms };
        const closed = SIDES.filter((side) => !arms[side] && !shell.apseOn.has(side)).map((side) => SIDE_BAY[side]);
        return { d, at, base: H + s, bay: s, closed, radius: Math.min(d.radius ?? s * 0.9, s) };
      }
      if (block.kind === "hall" && block.ceiling === "vault") {
        const w = block.aisles ? Math.max(1, block.width - 2 * block.aisles.width) : block.width;
        const top = block.aisles ? block.height : H;
        const closed: BaySide[] = shell.axis === "z" ? ["x+", "x-"] : ["z+", "z-"];
        return { d, at, base: top + w / 2, bay: w / 2, closed, radius: Math.min(d.radius ?? w * 0.45, w / 2) };
      }
      const apothem = block.kind === "rotunda" ? block.radius * Math.cos(Math.PI / block.sides) : Math.min(...(shell.rect ? [shell.rect.maxX - shell.rect.minX, shell.rect.maxZ - shell.rect.minZ] : [4])) / 2;
      return { d, at, base: H, bay: 0, closed: [] as BaySide[], radius: Math.min(d.radius ?? apothem * 0.8, apothem) };
    });

    if (hasHide(block, "inside") && (doors.length || windows.length)) {
      // Ներսը թաքցված է, բայց դրսի պատուհաններն ու դռները պետք են։
      rooms.push({ id: block.id, ghost: true, outline, height: H, ceiling: "flat", ...(doors.length ? { doors } : {}), ...(windows.length ? { windows } : {}) });
    }
    if (!hasHide(block, "inside")) {
      const flat = block.kind === "hall" ? block.ceiling === "flat" : block.kind === "rotunda" ? !shell.domes.length : false;
      rooms.push({
        id: block.id,
        ...(block.part ?? ((block.kind === "hall" && !block.parent) || block.kind === "cross" ? "nav" : undefined) ? { part: block.part ?? "nav" } : {}),
        ...("partAt" in block && block.partAt ? { partAt: block.partAt } : {}),
        outline, height: H, ceiling: flat && !shell.domes.length ? "flat" : "open",
        ...(Object.keys(heights).length ? { heights } : {}),
        ...(doors.length ? { doors } : {}), ...(windows.length ? { windows } : {}), ...(niches.length ? { niches } : {}),
        ...(apses.length ? { apses } : {}), ...(open.length ? { open } : {}), ...(shell.ceilings.length ? { ceilings: shell.ceilings } : {}),
      });
      for (const spec of domeSpecs) {
        domes.push({
          at: rp(spec.at), radius: r2(spec.radius), base: r2(spec.base), drum: spec.d.drum, sides: spec.d.sides,
          ...(spec.bay ? { bay: r2(spec.bay) } : { collar: polygon.map(rp) }),
          ...(spec.closed.length ? { closed: spec.closed } : {}),
          ...(spec.d.windows ? { windows: spec.d.windows } : {}),
          ...(spec.d.cap ? { cap: spec.d.cap } : {}),
          ...(spec.d.capHeight ? { capHeight: spec.d.capHeight } : {}),
          ...(spec.d.cross === false ? { cross: false } : {}),
          ...(spec.d.arcade ? { arcade: true } : {}),
          drumFrom: r2((block.kind === "hall" && block.aisles ? block.height : H) + WALL),
        });
      }
    }

    // Կամարներ (թաղ)՝ դահլիճի և խաչի թևերի վրա։
    if (!hasHide(block, "inside") && !hasHide(block, "vault")) {
      const closeAt = (wall: string, hw: number) => {
        const apse = shell.apseOn.get(wall);
        if (!apse) return true as const;
        return apse / 2 >= hw - 0.01 ? undefined : { hole: r2(apse / 2), rise: r2(apse / 2) };
      };
      if (block.kind === "hall" && block.ceiling === "vault" && shell.rect) {
        const r = shell.rect;
        const axis = shell.axis ?? "z";
        const nave = block.aisles ? Math.max(1, block.width - 2 * block.aisles.width) : block.width;
        const spring = block.aisles ? block.height : H;
        const lanes: Array<{ offset: number; width: number; spring: number; main: boolean }> = [{ offset: 0, width: nave, spring, main: true }];
        if (block.aisles) for (const sign of [-1, 1]) lanes.push({ offset: sign * (nave / 2 + block.aisles.width / 2), width: block.aisles.width, spring: block.aisles.height, main: false });
        const [lo, hi] = axis === "z" ? [r.minZ, r.maxZ] : [r.minX, r.maxX];
        const [loSide, hiSide]: [Side, Side] = axis === "z" ? ["east", "west"] : ["north", "south"];
        const mid = axis === "z" ? (r.minX + r.maxX) / 2 : (r.minZ + r.maxZ) / 2;
        const at = (along: number, off: number): Pt => (axis === "z" ? rp([mid + off, along]) : rp([along, mid + off]));
        for (const lane of lanes) {
          // Գմբեթի տակ կամարը ընդհատվում է (միայն մեջտեղի նավում)։
          const cuts = lane.main ? domeSpecs.map((spec) => (axis === "z" ? spec.at[1] : spec.at[0])).sort((p, q) => p - q) : [];
          let from = lo;
          let fromClose: Vault["closeFrom"] = lane.main ? closeAt(loSide, lane.width / 2) : true;
          for (const cut of [...cuts, null]) {
            const to = cut === null ? hi : cut - lane.width / 2;
            const toClose = cut === null ? (lane.main ? closeAt(hiSide, lane.width / 2) : true) : undefined;
            if (to - from > 0.05) {
              vaults.push({ from: at(from, lane.offset), to: at(to, lane.offset), width: r2(lane.width), spring: r2(lane.spring), ...(fromClose ? { closeFrom: fromClose } : {}), ...(toClose ? { closeTo: toClose } : {}) });
            }
            if (cut !== null) { from = cut + lane.width / 2; fromClose = undefined; }
          }
        }
        if (block.aisles) {
          for (const sign of [-1, 1]) {
            const top = block.height;
            arcades.push({ from: at(lo, sign * nave / 2), to: at(hi, sign * nave / 2), count: block.aisles.columns, spring: r2(Math.max(1.5, block.aisles.height - 1.3)), top: r2(top), pillar: 0.8 });
          }
        }
      }
      if (block.kind === "cross") {
        const s = block.half;
        const c = shell.center;
        for (const side of SIDES) {
          const L = block.arms[side] ?? 0;
          if (!L) continue;
          const out = SIDE_OUT[side];
          vaults.push({ from: rp(add(c, mul(out, s))), to: rp(add(c, mul(out, s + L))), width: r2(2 * s), spring: r2(H), ...(closeAt(side, s) ? { closeTo: closeAt(side, s)! } : {}) });
        }
      }
    }

    // Դրսի ծավալներ։
    if (!hasHide(block, "outside")) {
      const own: Mass[] = [];
      const T = WALL;
      /** Կողմի դրսի պատը. ներսի եզրից (կողմի ուղղությամբ) կամ թաքնված խորանից/ավանդատնից՝ ավելի հեռուն, գումարած պատը։ */
      const edge = (side: Side, inner: number) => {
        let value = Math.max(inner, shell.reach[side]);
        if (shell.hiddenApse.has(side)) for (const child of shell.childReach) if (child.side === side) value = Math.max(value, child.value);
        return value + T;
      };
      if (block.kind === "hall" && shell.rect) {
        const r = shell.rect;
        const box = { minX: -edge("north", -r.minX), maxX: edge("south", r.maxX), minZ: -edge("east", -r.minZ), maxZ: edge("west", r.maxZ) };
        const rectOutline = (b: typeof box) => [rp([b.minX, b.minZ]), rp([b.maxX, b.minZ]), rp([b.maxX, b.maxZ]), rp([b.minX, b.maxZ])];
        const axis = shell.axis ?? "z";
        const ridgeAxis: "x" | "z" = (block.ridge ?? (shell.attached ? "width" : "length")) === "length" ? axis : axis === "z" ? "x" : "z";
        const span = ridgeAxis === "z" ? box.maxX - box.minX : box.maxZ - box.minZ;
        if (block.aisles) {
          const nave = Math.max(1, block.width - 2 * block.aisles.width);
          const lowTop = r2(block.aisles.height + 0.5);
          own.push({ outline: rectOutline(box), height: lowTop, roof: { type: "flat" } });
          const naveBox = axis === "z" ? { ...box, minX: (r.minX + r.maxX) / 2 - nave / 2 - T, maxX: (r.minX + r.maxX) / 2 + nave / 2 + T } : { ...box, minZ: (r.minZ + r.maxZ) / 2 - nave / 2 - T, maxZ: (r.minZ + r.maxZ) / 2 + nave / 2 + T };
          own.push({ outline: rectOutline(naveBox), base: lowTop, height: r2(block.height + T), roof: { type: "gable", axis, rise: r2(block.rise ?? nave / 2) } });
        } else {
          const top = r2(H + T);
          const rise = r2(block.rise ?? (block.ceiling === "vault" ? span / 2 - 0.2 : Math.max(1.2, span * 0.16)));
          let roof: Roof = { type: "flat" };
          if (block.roof === "gable") roof = { type: "gable", axis: ridgeAxis, rise };
          if (block.roof === "tent") roof = { type: "tent", rise };
          if (block.roof === "shed") {
            const out = shell.attached?.out ?? [1, 0];
            const shedAxis: "x" | "z" = shell.attached ? (Math.abs(out[0]) > Math.abs(out[1]) ? "z" : "x") : ridgeAxis;
            const low: "-" | "+" = shell.attached ? ((shedAxis === "z" ? out[0] : out[1]) > 0 ? "+" : "-") : "+";
            roof = { type: "shed", axis: shedAxis, rise: r2(block.rise ?? Math.max(1, span * 0.18)), low };
          }
          own.push({ outline: rectOutline(box), height: top, roof });
        }
      }
      if (block.kind === "cross") {
        const s = block.half;
        const [cx, cz] = shell.center;
        const arms: Record<Side, number> = { east: 0, west: 0, north: 0, south: 0, ...block.arms };
        const inner: Record<Side, number> = { north: -cx + s + arms.north, south: cx + s + arms.south, east: -cz + s + arms.east, west: cz + s + arms.west };
        const out = (side: Side) => edge(side, inner[side]);
        // Կենտրոնից հեռավորությունը (ինչպես նախկինում՝ reach)։
        const reach = (side: Side) => out(side) - (side === "north" ? -cx : side === "south" ? cx : side === "east" ? -cz : cz);
        const top = r2(H + T);
        const rise = r2(block.rise ?? s + 0.2);
        const ns = [rp([cx - reach("north"), cz - s - T]), rp([cx + reach("south"), cz - s - T]), rp([cx + reach("south"), cz + s + T]), rp([cx - reach("north"), cz + s + T])];
        const ew = [rp([cx - s - T, cz - reach("east")]), rp([cx + s + T, cz - reach("east")]), rp([cx + s + T, cz + reach("west")]), rp([cx - s - T, cz + reach("west")])];
        if (block.outside === "square") {
          own.push({ outline: [rp([cx - reach("north"), cz - reach("east")]), rp([cx + reach("south"), cz - reach("east")]), rp([cx + reach("south"), cz + reach("west")]), rp([cx - reach("north"), cz + reach("west")])], height: top, roof: { type: "flat" } });
          own.push({ outline: ns, base: top, height: top, roof: { type: "gable", axis: "x", rise } });
          own.push({ outline: ew, base: top, height: top, roof: { type: "gable", axis: "z", rise } });
        } else {
          own.push({ outline: ns, height: top, roof: { type: "gable", axis: "x", rise } });
          own.push({ outline: ew, height: top, roof: { type: "gable", axis: "z", rise } });
        }
      }
      if (block.kind === "rotunda") {
        const ring = offsetPolygon(polygon, T).map(rp);
        own.push({ outline: ring, height: r2(H + T), roof: block.roof === "tent" && !shell.domes.length ? { type: "tent", rise: r2(block.rise ?? block.radius * 0.5) } : { type: "flat" } });
      }
      // Ծնողի ծավալի մեջ ամբողջովին թաքնված փոքր ծավալը (օր.՝ ավանդատունը) չենք կառուցում։
      const parentId = "parent" in block ? block.parent : undefined;
      const parentMasses = parentId ? shells.get(parentId)?.masses ?? [] : [];
      for (const mass of own) {
        const inside = parentMasses.some((pm) => pm.height >= mass.height + (mass.roof.type === "flat" ? 0 : 0.01) && polygonOf(mass.outline).every((p) => insidePolygon(offsetPolygon(polygonOf(pm.outline), 0.05), p[0], p[1])));
        if (!inside) shell.masses.push(mass);
      }
    }
  }
  for (const shell of shells.values()) masses.push(...shell.masses);

  for (const block of pendingBelfries) {
    const extra = { ...(block.tiers ? { tiers: block.tiers } : {}), ...(block.pavilion ? { pavilion: block.pavilion } : {}), ...(block.cross === false ? { cross: false } : {}) };
    const parent = block.parent ? shells.get(block.parent) : undefined;
    if (block.parent && !parent) { errors.push(`${block.id}՝ «${block.parent}»-ը պատեր չունի`); continue; }
    const at = parent ? add(parent.center, block.offset ?? [0, 0]) : block.at ?? [0, 0];
    if (block.tower) {
      // Աշտարակ գետնից (կարող է կանգնել ծնողի կողքին, օր.՝ արևմտյան մուտքի առջև)։
      const half = (block.towerSize ?? block.radius * 2.6 + 0.4) / 2;
      masses.push({ outline: [rp([at[0] - half, at[1] - half]), rp([at[0] + half, at[1] - half]), rp([at[0] + half, at[1] + half]), rp([at[0] - half, at[1] + half])], height: block.tower, roof: { type: "flat" }, ...(block.porch ? { arches: block.porch } : {}) });
      belfries.push({ at: rp(at), base: block.y ?? block.tower, radius: block.radius, columns: block.columns, height: block.height, ...extra });
      continue;
    }
    const top = block.y ?? ((roofTopAt(masses, at) || (parent ? parent.height + WALL : 0)) - 0.5);
    belfries.push({ at: rp(at), base: r2(top), radius: block.radius, columns: block.columns, height: block.height, ...extra });
  }

  return {
    model: {
      version: 1, id: model.id, name: model.name, tuff: model.tuff, ...(model.look ? { look: model.look } : {}),
      // Մեկ գմբեթ/զանգակատուն՝ հին դաշտով, որ 1-ին փուլի խմբագրիչը նույնպես կարողանա փոխել։
      rooms, vaults, arcades, masses,
      ...(domes.length === 1 ? { dome: domes[0] } : domes.length ? { domes } : {}),
      ...(belfries.length === 1 ? { belfry: belfries[0] } : belfries.length ? { belfries } : {}),
      ...(model.bema ? { bema: model.bema } : {}), balconies: model.balconies ?? [], items: [...extraItems, ...model.items],
      ...(model.cameras ? { cameras: model.cameras } : {}),
    },
    errors,
  };
}

/** Ցանկացած տարբերակ → v1 ձև (3D-ի, հատակագծի և կետերի համար)։ */
export function resolveModel(model: AnyChurchModel): ChurchModel {
  return model.version === 2 ? compileModel(model).model : model;
}

// ---------- Ստուգում ----------

const KINDS: readonly BlockKind[] = ["hall", "cross", "rotunda", "apse", "dome", "belfry", "free"];
const SHAPES: readonly OpeningShape[] = ["arch", "rect", "round", "slit", "cross"];

/** Ստուգում է v1 կամ v2 անձնագիրը. v2-ի դեպքում ստուգում է նաև կառուցված արդյունքը։ */
export function validateAnyModel(input: unknown): { model: AnyChurchModel | null; shape: ChurchModel | null; errors: string[] } {
  if (typeof input === "object" && input !== null && (input as { version?: unknown }).version === 1) {
    const result = validateModel(input);
    return { model: result.model, shape: result.model, errors: result.errors };
  }
  const { errors, fail, isObj, num, optNum, pt, v3, list, str, oneOf, look } = makeChecker();
  if (!isObj(input)) return { model: null, shape: null, errors: ["Անձնագիրը պետք է լինի JSON օբյեկտ { … }"] };
  const m = input;
  if (m.version !== 2) fail("version", "պետք է լինի 1 կամ 2");
  str(m.id, "id", 60, false);
  str(m.name, "name", 120, false);
  oneOf(m.tuff, ["pink", "ochre", "gray", "black"] as const, "tuff");
  look(m.look, "look");
  const ids = new Set<string>();
  const openings = (b: Record<string, unknown>, path: string) => {
    list(b.doors, `${path}.doors`, 20, (d, at) => {
      if (!isObj(d)) return fail(at, "պետք է օբյեկտ լինի");
      str(d.wall, `${at}.wall`, 40, false); optNum(d.at, `${at}.at`, -60, 60); num(d.w, `${at}.w`, 0.3, 10); num(d.h, `${at}.h`, 0.5, 15);
    }, true);
    list(b.windows, `${path}.windows`, 60, (w, at) => {
      if (!isObj(w)) return fail(at, "պետք է օբյեկտ լինի");
      if (b.kind !== "apse") str(w.wall, `${at}.wall`, 40, false);
      optNum(w.at, `${at}.at`, -60, 60); num(w.y, `${at}.y`, 0, 40); num(w.w, `${at}.w`, 0.1, 6); num(w.h, `${at}.h`, 0.1, 8);
      oneOf(w.shape, SHAPES, `${at}.shape`, true); optNum(w.count, `${at}.count`, 1, 20); optNum(w.gap, `${at}.gap`, 0.2, 20);
      oneOf(w.frame, ["pediment", "hood"] as const, `${at}.frame`, true);
    }, true);
    list(b.niches, `${path}.niches`, 20, (n, at) => {
      if (!isObj(n)) return fail(at, "պետք է օբյեկտ լինի");
      str(n.wall, `${at}.wall`, 40, false); optNum(n.at, `${at}.at`, -60, 60); num(n.w, `${at}.w`, 0.3, 8); num(n.h, `${at}.h`, 0.5, 15); num(n.depth, `${at}.depth`, 0.1, 3);
    }, true);
  };
  list(m.blocks, "blocks", 60, (b, path) => {
    if (!isObj(b)) return fail(path, "պետք է օբյեկտ լինի");
    str(b.id, `${path}.id`, 40, false);
    if (typeof b.id === "string") { if (ids.has(b.id)) fail(`${path}.id`, `«${b.id}» կրկնվում է`); ids.add(b.id); }
    oneOf(b.kind, KINDS, `${path}.kind`);
    str(b.name, `${path}.name`, 80);
    str(b.parent, `${path}.parent`, 40); str(b.wall, `${path}.wall`, 40);
    if (b.kind !== "dome" && b.kind !== "belfry") optNum(b.offset, `${path}.offset`, -60, 60);
    optNum(b.gap, `${path}.gap`, 0, 40);
    if (b.cross !== undefined && typeof b.cross !== "boolean") fail(`${path}.cross`, "պետք է լինի true կամ false");
    if (b.arcade !== undefined && typeof b.arcade !== "boolean") fail(`${path}.arcade`, "պետք է լինի true կամ false");
    list(b.hide, `${path}.hide`, 40, (h, at) => str(h, at, 60, false), true);
    if (b.at !== undefined) pt(b.at, `${path}.at`);
    if (b.kind === "hall") {
      num(b.width, `${path}.width`, 1, 60); num(b.length, `${path}.length`, 1, 80); num(b.height, `${path}.height`, 1, 40);
      oneOf(b.ceiling, ["vault", "flat"] as const, `${path}.ceiling`); oneOf(b.roof, ["gable", "shed", "tent", "flat"] as const, `${path}.roof`);
      optNum(b.rise, `${path}.rise`, 0, 30); oneOf(b.ridge, ["length", "width"] as const, `${path}.ridge`, true);
      oneOf(b.link, ["door", "arch", "none"] as const, `${path}.link`, true); optNum(b.linkW, `${path}.linkW`, 0.4, 30); optNum(b.linkH, `${path}.linkH`, 0.5, 30);
      if (b.partAt !== undefined) v3(b.partAt, `${path}.partAt`);
      if (b.aisles !== undefined) {
        if (!isObj(b.aisles)) fail(`${path}.aisles`, "պետք է օբյեկտ լինի");
        else { num(b.aisles.width, `${path}.aisles.width`, 0.5, 20); num(b.aisles.height, `${path}.aisles.height`, 1, 40); num(b.aisles.columns, `${path}.aisles.columns`, 2, 30); }
      }
      if ((b.parent === undefined) !== (b.wall === undefined)) fail(`${path}`, "parent և wall պետք է տրված լինեն միասին");
      openings(b, path);
    }
    if (b.kind === "cross") {
      num(b.half, `${path}.half`, 1, 20); num(b.height, `${path}.height`, 1, 40); oneOf(b.outside, ["cross", "square"] as const, `${path}.outside`);
      optNum(b.piers, `${path}.piers`, 0.3, 6);
      optNum(b.rise, `${path}.rise`, 0, 30);
      if (b.partAt !== undefined) v3(b.partAt, `${path}.partAt`);
      if (!isObj(b.arms)) fail(`${path}.arms`, "պետք է լինի { west, east, north, south }");
      else for (const [key, value] of Object.entries(b.arms)) { oneOf(key, SIDES, `${path}.arms.${key}`); num(value, `${path}.arms.${key}`, 0, 40); }
      openings(b, path);
    }
    if (b.kind === "rotunda") {
      num(b.sides, `${path}.sides`, 5, 32); num(b.radius, `${path}.radius`, 1, 30); num(b.height, `${path}.height`, 1, 40);
      oneOf(b.roof, ["tent", "flat"] as const, `${path}.roof`); optNum(b.rise, `${path}.rise`, 0, 30);
      openings(b, path);
    }
    if (b.kind === "apse") {
      str(b.parent, `${path}.parent`, 40, false); str(b.wall, `${path}.wall`, 40, false);
      num(b.width, `${path}.width`, 1, 30); num(b.depth, `${path}.depth`, 0.3, 20); oneOf(b.outside, ["hidden", "round", "faceted"] as const, `${path}.outside`);
      oneOf(b.roof, ["cone", "flat"] as const, `${path}.roof`, true);
      openings(b, path);
    }
    if (b.kind === "dome") {
      str(b.parent, `${path}.parent`, 40, false); if (b.offset !== undefined) pt(b.offset, `${path}.offset`);
      optNum(b.radius, `${path}.radius`, 0.5, 20); num(b.drum, `${path}.drum`, 0, 20); num(b.sides, `${path}.sides`, 4, 32);
      oneOf(b.cap, ["cone", "umbrella", "none"] as const, `${path}.cap`, true); optNum(b.capHeight, `${path}.capHeight`, 0.2, 4);
      if (b.windows !== undefined) {
        if (!isObj(b.windows)) fail(`${path}.windows`, "պետք է օբյեկտ լինի");
        else { num(b.windows.count, `${path}.windows.count`, 0, 32); num(b.windows.w, `${path}.windows.w`, 0.1, 3); num(b.windows.h, `${path}.windows.h`, 0.1, 5); oneOf(b.windows.shape, SHAPES, `${path}.windows.shape`, true); }
      }
    }
    if (b.kind === "belfry") {
      if (b.offset !== undefined) pt(b.offset, `${path}.offset`);
      optNum(b.tower, `${path}.tower`, 1, 60); num(b.radius, `${path}.radius`, 0.3, 6); num(b.columns, `${path}.columns`, 3, 16);
      num(b.height, `${path}.height`, 0.5, 10); optNum(b.tiers, `${path}.tiers`, 1, 4); optNum(b.pavilion, `${path}.pavilion`, 0, 10);
      optNum(b.y, `${path}.y`, 0, 80); optNum(b.towerSize, `${path}.towerSize`, 1, 30);
      if (b.porch !== undefined) { if (!isObj(b.porch)) fail(`${path}.porch`, "պետք է օբյեկտ լինի"); else { num(b.porch.w, `${path}.porch.w`, 0.3, 20); num(b.porch.h, `${path}.porch.h`, 0.5, 30); } }
    }
  });
  if (Array.isArray(m.blocks) && !m.blocks.length) fail("blocks", "պետք է լինի գոնե մեկ բլոկ");
  if (errors.length) return { model: null, shape: null, errors };
  // Բլոկների կապերը և կառուցված ձևը՝ v1 ստուգումով (բեմ, պարագաներ, ազատ ձևեր և այլն)։
  const doc = m as unknown as ChurchModelV2;
  const compiled = compileModel(doc);
  if (compiled.errors.length) return { model: null, shape: null, errors: compiled.errors.slice(0, 30) };
  const check = validateModel(compiled.model);
  if (!check.model) return { model: null, shape: null, errors: check.errors.map((e) => `(կառուցված ձևում) ${e}`) };
  return { model: doc, shape: check.model, errors: [] };
}
