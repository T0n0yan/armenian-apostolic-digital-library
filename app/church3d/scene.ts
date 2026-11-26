// 3D եկեղեցին՝ կոդով, առանց նկարների և պատրաստի մոդելների։ Բեռնվում է միայն /church-3d էջում։
// Արագության համար՝
// - ամեն նյութի (գույնի) բոլոր մասերը միացված են մեկ mesh-ում → ~20 draw call ամբողջ տեսարանի համար
// - էկրանը նկարվում է միայն շարժման պահին (անընդհատ ցիկլ չկա), ստվերներ չկան, լույսը՝ գագաթների գույներով
// - ներսի պատերը միակողմանի են և նայում են ներս. դրսից մոտակա պատերն ինքնին անտեսանելի են («կտրվածք»)
import {
  BufferGeometry, Color, CylinderGeometry, ConeGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Group, HemisphereLight, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera,
  Scene, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, BoxGeometry, Vector2, Vector3, WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  APSE_CENTER, APSE_RADIUS, BEMA_FRONT, BEMA_HEIGHT, DRUM_BOTTOM, DRUM_RADIUS, DRUM_TOP, OUTLINE, ROOMS, WALL_HEIGHT,
  type P2, type Room,
} from "./plan";
import type { ChurchPart, TourStep, Vec3 } from "./parts";

export type ViewMode = "cutaway" | "outside";

export type ChurchScene = {
  setMode(mode: ViewMode): void;
  focus(eye: Vec3, look: Vec3): void;
  select(id: string | null): void;
  showTour(step: TourStep | null): void;
  reset(): void;
  dispose(): void;
};

const DEFAULT_VIEW: Record<ViewMode, { eye: Vec3; look: Vec3 }> = {
  cutaway: { eye: [24, 27, 30], look: [0, 4, 1.5] },
  outside: { eye: [30, 15, 38], look: [0, 7, 3] },
};

const UP = new Vector3(0, 1, 0);

// ---------- Երկրաչափություն ----------

/** Մեկ նյութի (bucket) կտորները, որ վերջում միանում են մեկ mesh-ում։ */
type Bucket = BufferGeometry[];

/** Միայն position + normal, առանց ինդեքսի, որ mergeGeometries-ը միացնի ամեն ինչ։ */
function clean(geometry: BufferGeometry, flat = false) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  if (plain !== geometry) geometry.dispose();
  for (const name of Object.keys(plain.attributes)) if (name !== "position" && name !== "normal") plain.deleteAttribute(name);
  if (flat || !plain.getAttribute("normal")) plain.computeVertexNormals();
  return plain;
}

/** Մակերես f(u,v)-ից. եռանկյունները շրջվում են այնպես, որ նայեն `normal(p)`-ի կողմը։ */
function surface(nu: number, nv: number, f: (u: number, v: number) => Vector3, normal: (p: Vector3) => Vector3) {
  const pos: number[] = [];
  const nor: number[] = [];
  const pts: Vector3[][] = [];
  for (let i = 0; i <= nu; i++) {
    pts.push([]);
    for (let j = 0; j <= nv; j++) pts[i].push(f(i / nu, j / nv));
  }
  const ab = new Vector3();
  const ac = new Vector3();
  const centroid = new Vector3();
  const push = (a: Vector3, b: Vector3, c: Vector3) => {
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const n = ab.cross(ac);
    if (n.lengthSq() < 1e-10) return;
    centroid.copy(a).add(b).add(c).divideScalar(3);
    const tri = n.dot(normal(centroid)) >= 0 ? [a, b, c] : [a, c, b];
    for (const p of tri) {
      pos.push(p.x, p.y, p.z);
      const pn = normal(p);
      nor.push(pn.x, pn.y, pn.z);
    }
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      push(pts[i][j], pts[i + 1][j], pts[i + 1][j + 1]);
      push(pts[i][j], pts[i + 1][j + 1], pts[i][j + 1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  return geometry;
}

const constant = (n: Vector3) => () => n;

/** Հարթ ուղղանկյուն՝ a-ից b (հորիզոնական), y0-ից y1։ */
function wallPiece(a: Vector3, b: Vector3, y0: number, y1: number, n: Vector3) {
  return surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).setY(y0 + (y1 - y0) * v), constant(n));
}

/** Կամարաձև վահանակ (պատուհան, դուռ, որմնախորշ). հիմքի կենտրոնը (0,0), լայնությունը w, բարձրությունը h։ */
function archShape(w: number, h: number) {
  const r = w / 2;
  const shape = new Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
}

/** Տեղադրում է հարթ ձևը (local XY, դեմքը +Z) տրված կետում՝ դեմքով դեպի n։ */
function place(geometry: BufferGeometry, at: Vector3, n: Vector3) {
  const normal = n.clone().normalize();
  const helperUp = Math.abs(normal.y) > 0.9 ? new Vector3(0, 0, -1) : UP;
  const right = new Vector3().crossVectors(helperUp, normal).normalize();
  const up = new Vector3().crossVectors(normal, right);
  geometry.applyMatrix4(new Matrix4().makeBasis(right, up, normal).setPosition(at));
  return geometry;
}

function arch(w: number, h: number, at: Vector3, n: Vector3) {
  return place(clean(new ShapeGeometry(archShape(w, h), 6)), at, n);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return clean(new BoxGeometry(w, h, d).translate(x, y + h / 2, z));
}

function cylinder(rTop: number, rBottom: number, h: number, segments: number, x: number, y: number, z: number, flat = false) {
  return clean(new CylinderGeometry(rTop, rBottom, h, segments, 1, false).translate(x, y + h / 2, z), flat);
}

function lathe(profile: Array<[number, number]>, segments: number, x: number, y: number, z: number) {
  return clean(new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), segments).translate(x, y, z));
}

/** Հատակի ձև (x, z) → հորիզոնական ShapeGeometry `y` բարձրության վրա, դեմքով վեր կամ վար։ */
function flatShape(points: readonly P2[], y: number, facing: "up" | "down") {
  const shape = new Shape(points.map(([x, z]) => new Vector2(x, facing === "up" ? -z : z)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(facing === "up" ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0);
  return clean(geometry);
}

function inside(points: readonly P2[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Սենյակի պատերը (դռներով), դեմքով դեպի ներս։ */
function roomWalls(room: Room, out: Bucket) {
  const pts = room.points;
  pts.forEach((start, index) => {
    const end = pts[(index + 1) % pts.length];
    const a = new Vector3(start[0], 0, start[1]);
    const b = new Vector3(end[0], 0, end[1]);
    const length = a.distanceTo(b);
    const dir = new Vector3().subVectors(b, a).normalize();
    let n = new Vector3(-dir.z, 0, dir.x);
    const mid = new Vector3().lerpVectors(a, b, 0.5);
    if (!inside(pts, mid.x + n.x * 0.05, mid.z + n.z * 0.05)) n = n.negate();
    const at = (s: number) => a.clone().addScaledVector(dir, s);
    let cursor = 0;
    for (const door of [...(room.doors?.[index] ?? [])].sort((p, q) => p.from - q.from)) {
      if (door.from > cursor) out.push(wallPiece(at(cursor), at(door.from), 0, room.height, n));
      out.push(wallPiece(at(door.from), at(door.to), door.top, room.height, n));
      cursor = door.to;
    }
    if (cursor < length) out.push(wallPiece(at(cursor), at(length), 0, room.height, n));
  });
}

/** Թևի գլանաձև կամարը՝ start-ից end, լայնակի ուղղությունը `across`։ */
function barrelVault(start: Vector3, end: Vector3, across: Vector3, radius: number) {
  return surface(1, 16, (u, v) => {
    const angle = Math.PI * v;
    return new Vector3().lerpVectors(start, end, u).addScaledVector(across, radius * Math.cos(angle)).addScaledVector(UP, radius * Math.sin(angle));
  }, (p) => {
    const axis = new Vector3().subVectors(end, start);
    const t = new Vector3().subVectors(p, start).dot(axis) / axis.lengthSq();
    return new Vector3().lerpVectors(start, end, t).sub(p).normalize();
  });
}

/** Կիսաշրջան պատի վերևում (թևի ծայրին)՝ դեմքով դեպի ներս։ */
function tympanum(center: Vector3, across: Vector3, radius: number, n: Vector3) {
  return surface(1, 16, (u, v) => {
    const angle = Math.PI * v;
    return center.clone().addScaledVector(across, radius * u * Math.cos(angle)).addScaledVector(UP, radius * u * Math.sin(angle));
  }, constant(n));
}

/** Կամարի և քառակուսու միջև անկյունները (առագաստ)՝ կենտրոնական քառակուսու մեկ կողմում։ */
function spandrel(side: "x+" | "x-" | "z+" | "z-") {
  const half = WALL_HEIGHT;
  const toWorld = (s: number, y: number) => {
    if (side === "z+") return new Vector3(s, y, 4);
    if (side === "z-") return new Vector3(s, y, -4);
    if (side === "x+") return new Vector3(4, y, s);
    return new Vector3(-4, y, s);
  };
  const n = side === "z+" ? new Vector3(0, 0, -1) : side === "z-" ? new Vector3(0, 0, 1) : side === "x+" ? new Vector3(-1, 0, 0) : new Vector3(1, 0, 0);
  return [1, -1].map((mirror) => surface(1, 8, (u, v) => {
    const t = (Math.PI / 2) * v;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    const reach = Math.min(dx > 1e-6 ? 4 / dx : Infinity, dy > 1e-6 ? 4 / dy : Infinity);
    const r = 4 + (reach - 4) * u;
    return toWorld(mirror * r * dx, half + r * dy);
  }, constant(n)));
}

/** Գլան կամ գմբեթ՝ դեմքով դեպի կենտրոն (ներսից երևացող)։ */
function innerDrum() {
  return surface(1, 24, (u, v) => {
    const a = Math.PI * 2 * v;
    return new Vector3(DRUM_RADIUS * Math.cos(a), DRUM_BOTTOM + (DRUM_TOP - DRUM_BOTTOM) * u, DRUM_RADIUS * Math.sin(a));
  }, (p) => new Vector3(-p.x, 0, -p.z).normalize());
}

function innerDome() {
  const c = new Vector3(0, DRUM_TOP, 0);
  return surface(8, 24, (u, v) => {
    const e = (Math.PI / 2) * u;
    const a = Math.PI * 2 * v;
    return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).multiplyScalar(DRUM_RADIUS).add(c);
  }, (p) => c.clone().sub(p).normalize());
}

function apseConch() {
  const c = new Vector3(APSE_CENTER[0], WALL_HEIGHT, APSE_CENTER[1]);
  return surface(8, 12, (u, v) => {
    const e = (Math.PI / 2) * u;
    const a = Math.PI * v;
    return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a)).multiplyScalar(APSE_RADIUS).add(c);
  }, (p) => c.clone().sub(p).normalize());
}

/** Կենտրոնական քառակուսու առաստաղը՝ թմբուկի կլոր բացվածքով։ */
function drumRing() {
  const shape = new Shape([new Vector2(-4, -4), new Vector2(4, -4), new Vector2(4, 4), new Vector2(-4, 4)]);
  const hole = new Shape();
  hole.absarc(0, 0, DRUM_RADIUS, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  return clean(new ShapeGeometry(shape, 24).rotateX(Math.PI / 2).translate(0, DRUM_BOTTOM, 0));
}

/** Երկթեք տանիք՝ `axis`-ի երկայնքով. `roof`՝ թեքությունները, `gable`՝ եռանկյուն ճակատները։ */
function gableRoof(axis: "x" | "z", halfWidth: number, from: number, to: number, base: number, rise: number, roof: Bucket, gable: Bucket, center = 0) {
  const map = (along: number, across: number, y: number) => axis === "z" ? new Vector3(center + across, y, along) : new Vector3(along, y, center + across);
  for (const side of [1, -1]) {
    const n = axis === "z" ? new Vector3(side * rise, halfWidth, 0).normalize() : new Vector3(0, halfWidth, side * rise).normalize();
    roof.push(surface(1, 1, (u, v) => map(from + (to - from) * u, side * halfWidth * (1 - v), base + rise * v), constant(n)));
  }
  for (const [along, sign] of [[from, -1], [to, 1]] as const) {
    const n = axis === "z" ? new Vector3(0, 0, sign) : new Vector3(sign, 0, 0);
    const triangle = new Shape([new Vector2(-halfWidth, 0), new Vector2(halfWidth, 0), new Vector2(0, rise)]);
    gable.push(place(clean(new ShapeGeometry(triangle)), map(along, 0, base), n));
  }
}

// ---------- Նյութեր ----------

type Look = { color: string; low?: string; emissive?: string; basic?: boolean; double?: boolean };

const LOOKS = {
  tuff: { color: "#ffffff", low: "#9a776a" },
  floor: { color: "#bcae9f" },
  stone: { color: "#cdb8a6" },
  carpet: { color: "#7a2a2c" },
  marble: { color: "#f1e9dc" },
  wood: { color: "#6e4b33" },
  gold: { color: "#d2a850", emissive: "#4a3410" },
  fabric: { color: "#8e1f28", double: true },
  glow: { color: "#fff0cc", basic: true },
  icon: { color: "#2f4475" },
  niche: { color: "#5d453d" },
  water: { color: "#9cc6d8", basic: true },
  sand: { color: "#d9c69c" },
  extTuff: { color: "#ffffff", low: "#9c614b" },
  roof: { color: "#8a5848" },
  extDark: { color: "#33241f", basic: true },
} satisfies Record<string, Look>;

type LookName = keyof typeof LOOKS;

/** Ներքևում մուգ, վերևում բաց (պատերի «լույսը» առանց ստվերների)։ */
const GRADIENT: Partial<Record<LookName, { low: Color; high: Color; top: number }>> = {
  tuff: { low: new Color("#9a776a"), high: new Color("#f3e2d2"), top: 19 },
  extTuff: { low: new Color("#a3654e"), high: new Color("#e0a98b"), top: 20 },
};

function material(look: Look): Material {
  const side = look.double ? { side: DoubleSide } : {};
  if (look.basic) return new MeshBasicMaterial({ color: look.color, ...side });
  return new MeshLambertMaterial({ color: look.color, emissive: look.emissive ?? "#000000", vertexColors: Boolean(look.low), ...side });
}

function tint(geometry: BufferGeometry, gradient: NonNullable<(typeof GRADIENT)[LookName]>) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const t = Math.min(1, Math.max(0, y / gradient.top));
    c.copy(gradient.low).lerp(gradient.high, Math.sqrt(t));
    if (y < 1.2) c.multiplyScalar(0.82 + 0.18 * (y / 1.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

class Kit {
  readonly buckets = new Map<LookName, Bucket>();
  add(look: LookName, ...geometries: BufferGeometry[]) {
    const bucket = this.buckets.get(look) ?? [];
    bucket.push(...geometries);
    this.buckets.set(look, bucket);
  }
  build(materials: Map<LookName, Material>) {
    const group = new Group();
    for (const [look, parts] of this.buckets) {
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      const gradient = GRADIENT[look];
      if (gradient) tint(merged, gradient);
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, materials.get(look));
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

// ---------- Ներսը ----------

function windowsInside(kit: Kit) {
  const add = (w: number, h: number, x: number, y: number, z: number, n: Vector3) => kit.add("glow", arch(w, h, new Vector3(x, y, z).addScaledVector(n, 0.03), n));
  add(0.6, 1.6, 0, 9.8, 11, new Vector3(0, 0, -1));
  add(0.5, 1.6, 0, 4.6, 11, new Vector3(0, 0, -1));
  for (const s of [-1, 1]) {
    add(0.6, 1.6, s * 7, 9.8, 0, new Vector3(-s, 0, 0));
    add(0.5, 1.6, s * 7, 5.4, 0, new Vector3(-s, 0, 0));
    add(0.5, 1.6, s * 4, 5.6, 7.5, new Vector3(-s, 0, 0));
  }
  // Խորանի պատը 12 նիստ ունի. պատուհանները նիստերի մեջտեղում են (կենտրոնում պատկերն է)։
  for (const a of [(5 * Math.PI) / 24, (19 * Math.PI) / 24]) {
    const r = APSE_RADIUS * Math.cos(Math.PI / 24) - 0.03;
    const p = new Vector3(r * Math.cos(a), 5.8, APSE_CENTER[1] - r * Math.sin(a));
    kit.add("glow", arch(0.45, 1.5, p, new Vector3(-Math.cos(a), 0, Math.sin(a))));
  }
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 + Math.PI / 12;
    const n = new Vector3(-Math.cos(a), 0, -Math.sin(a));
    kit.add("glow", arch(0.42, 1.5, new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(DRUM_RADIUS - 0.05).setY(13.9), n));
  }
}

function sanctuary(kit: Kit) {
  // Բեմը՝ խորանի կիսաշրջանը + առջևի ուղղանկյունը։
  const bemaPoints: P2[] = [[-4, BEMA_FRONT], [4, BEMA_FRONT], [4, -4]];
  for (let i = 1; i < 12; i++) {
    const a = (Math.PI * i) / 12;
    bemaPoints.push([APSE_RADIUS * Math.cos(a), APSE_CENTER[1] - APSE_RADIUS * Math.sin(a)]);
  }
  bemaPoints.push([-4, -4]);
  const front = new Vector3(0, 0, 1);
  kit.add("stone", wallPiece(new Vector3(-4, 0, BEMA_FRONT), new Vector3(4, 0, BEMA_FRONT), 0, BEMA_HEIGHT, front));
  kit.add("stone", flatShape(bemaPoints, BEMA_HEIGHT, "up"));
  kit.add("carpet", flatShape([[-2.6, BEMA_FRONT - 0.3], [2.6, BEMA_FRONT - 0.3], [2.6, -5.2], [-2.6, -5.2]], BEMA_HEIGHT + 0.01, "up"));
  kit.add("gold", box(8, 0.06, 0.06, 0, BEMA_HEIGHT - 0.06, BEMA_FRONT + 0.03));

  // Սանդուղքներ երկու կողմից, մեջտեղում՝ ատյանը։
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) kit.add("stone", box(0.9, (BEMA_HEIGHT * (4 - i)) / 4, 0.42, s * 3.3, 0, BEMA_FRONT + 0.21 + 0.42 * i));
  }
  kit.add("stone", box(5.2, 0.35, 1.9, 0, 0, BEMA_FRONT + 0.95));
  kit.add("carpet", box(4.6, 0.01, 1.5, 0, 0.35, BEMA_FRONT + 0.95));

  // Գրակալ։
  kit.add("wood", cylinder(0.05, 0.07, 0.95, 8, 0, 0.35, -1.6));
  const desk = new BoxGeometry(0.62, 0.04, 0.46).rotateX(0.45).translate(0, 1.36, -1.6);
  kit.add("wood", clean(desk));
  kit.add("gold", clean(new BoxGeometry(0.34, 0.05, 0.3).rotateX(0.45).translate(0, 1.4, -1.6)));

  // Սուրբ Սեղան՝ սեղան, աստիճաններ, խաչ, մոմեր, Ավետարան։
  kit.add("marble", box(2, 1.05, 1.1, 0, BEMA_HEIGHT, -6.1));
  kit.add("fabric", box(1.9, 0.8, 0.02, 0, BEMA_HEIGHT + 0.16, -5.54));
  kit.add("gold", box(0.06, 0.5, 0.025, 0, BEMA_HEIGHT + 0.3, -5.52), box(0.32, 0.06, 0.025, 0, BEMA_HEIGHT + 0.6, -5.52));
  kit.add("gold", box(0.36, 0.07, 0.46, 0, BEMA_HEIGHT + 1.05, -6));
  for (let k = 0; k < 3; k++) {
    const h = 1.25 + 0.3 * k;
    const z = -6.85 - 0.35 * k;
    kit.add("marble", box(2.4 - 0.3 * k, h, 0.35, 0, BEMA_HEIGHT, z));
    for (const x of [-0.95, -0.55, 0.55, 0.95].map((v) => v * (1 - 0.12 * k))) {
      kit.add("marble", cylinder(0.03, 0.03, 0.32, 6, x, BEMA_HEIGHT + h, z));
      kit.add("glow", box(0.035, 0.08, 0.035, x, BEMA_HEIGHT + h + 0.33, z));
    }
  }
  const crossBase = BEMA_HEIGHT + 1.25 + 0.6;
  kit.add("gold", box(0.08, 0.85, 0.08, 0, crossBase, -7.55), box(0.46, 0.08, 0.08, 0, crossBase + 0.55, -7.55));

  // Աստվածածնի պատկեր (պարզեցված)՝ շրջանակ, ֆոն, լուսապսակ, կարմիր զգեստ։
  const wall = new Vector3(0, 0, 1);
  kit.add("gold", arch(2.25, 3.25, new Vector3(0, 4.55, -7.83), wall));
  kit.add("icon", arch(2, 3, new Vector3(0, 4.68, -7.81), wall));
  kit.add("fabric", arch(1.05, 1.9, new Vector3(0, 4.9, -7.79), wall));
  kit.add("gold", place(clean(new ShapeGeometry(circleShape(0.34), 1)), new Vector3(0, 7.05, -7.79), wall));

  // Վարագույրի ձող։
  kit.add("gold", clean(new CylinderGeometry(0.05, 0.05, 8.4, 8).rotateZ(Math.PI / 2).translate(0, 8.7, BEMA_FRONT - 0.05)));
}

function circleShape(r: number) {
  const shape = new Shape();
  shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  return shape;
}

function nave(kit: Kit) {
  // Դաս՝ փայտե ցանկապատ և երգի կանգնակներ երկու թևերում։
  for (const s of [-1, 1]) {
    kit.add("wood", box(0.08, 0.9, 3, s * 4.5, 0, -0.9));
    for (const [x, z] of [[5.2, -0.2], [5.9, -1.5]]) {
      kit.add("wood", cylinder(0.035, 0.05, 1.05, 6, s * x, 0, z));
      kit.add("wood", clean(new BoxGeometry(0.5, 0.03, 0.36).rotateZ(s * 0.5).translate(s * x, 1.1, z)));
    }
  }

  // Մկրտության ավազան՝ հյուսիսային պատի որմնախորշում։
  kit.add("niche", arch(1.7, 2.7, new Vector3(-6.97, 0, 2.6), new Vector3(1, 0, 0)));
  kit.add("stone", lathe([[0, 0], [0.36, 0], [0.36, 0.1], [0.2, 0.22], [0.16, 0.6], [0.5, 0.75], [0.56, 1.0], [0.48, 1.02], [0.42, 0.86], [0, 0.86]], 18, -6.2, 0, 2.6));
  kit.add("water", place(clean(new ShapeGeometry(circleShape(0.42), 12)), new Vector3(-6.2, 0.88, 2.6), UP));

  // Մոմավառության սեղան՝ ավազով, մոմերով։
  kit.add("stone", box(1.4, 0.75, 0.8, 2.9, 0, 9.2));
  kit.add("sand", box(1.3, 0.04, 0.7, 2.9, 0.75, 9.2));
  for (let i = 0; i < 9; i++) {
    const x = 2.35 + (i % 5) * 0.27 + (i > 4 ? 0.13 : 0);
    const z = 9.0 + (i > 4 ? 0.35 : 0) + ((i * 37) % 7) * 0.012;
    const h = 0.18 + ((i * 53) % 5) * 0.03;
    kit.add("marble", cylinder(0.012, 0.012, h, 5, x, 0.79, z));
    kit.add("glow", box(0.022, 0.05, 0.022, x, 0.79 + h, z));
  }

  // Ջահ՝ գմբեթի տակ։
  kit.add("gold", clean(new TorusGeometry(1.6, 0.05, 6, 36).rotateX(Math.PI / 2).translate(0, 9.6, 0)));
  kit.add("gold", cylinder(0.03, 0.03, DRUM_BOTTOM - 9.6, 6, 0, 9.6, 0));
  for (const a of [0, Math.PI / 2]) kit.add("gold", clean(new BoxGeometry(3.2, 0.04, 0.04).rotateY(a).translate(0, 9.6, 0)));
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    kit.add("glow", box(0.07, 0.14, 0.07, 1.6 * Math.cos(a), 9.66, 1.6 * Math.sin(a)));
  }
}

function buildInterior(kit: Kit) {
  for (const room of ROOMS) {
    roomWalls(room, getBucket(kit, "tuff"));
    kit.add("floor", flatShape(room.points, 0, "up"));
    if (room.flatCeiling) kit.add("tuff", flatShape(room.points, room.height, "down"));
  }
  const R = 4;
  kit.add("tuff",
    barrelVault(new Vector3(0, WALL_HEIGHT, 4), new Vector3(0, WALL_HEIGHT, 11), new Vector3(1, 0, 0), R),
    barrelVault(new Vector3(-4, WALL_HEIGHT, 0), new Vector3(-7, WALL_HEIGHT, 0), new Vector3(0, 0, 1), R),
    barrelVault(new Vector3(4, WALL_HEIGHT, 0), new Vector3(7, WALL_HEIGHT, 0), new Vector3(0, 0, 1), R),
    tympanum(new Vector3(0, WALL_HEIGHT, 11), new Vector3(1, 0, 0), R, new Vector3(0, 0, -1)),
    tympanum(new Vector3(-7, WALL_HEIGHT, 0), new Vector3(0, 0, 1), R, new Vector3(1, 0, 0)),
    tympanum(new Vector3(7, WALL_HEIGHT, 0), new Vector3(0, 0, 1), R, new Vector3(-1, 0, 0)),
    ...spandrel("x+"), ...spandrel("x-"), ...spandrel("z+"), ...spandrel("z-"),
    apseConch(), drumRing(), innerDrum(), innerDome(),
  );
  windowsInside(kit);
  sanctuary(kit);
  nave(kit);
}

function getBucket(kit: Kit, look: LookName): Bucket {
  const bucket = kit.buckets.get(look) ?? [];
  kit.buckets.set(look, bucket);
  return bucket;
}

// ---------- Դուրսը ----------

function buildExterior(kit: Kit) {
  const { main, gavit } = OUTLINE;
  const mainDepth = main.west - main.east;
  kit.add("extTuff", box(main.x * 2, main.height, mainDepth, 0, 0, (main.west + main.east) / 2));
  gableRoof("z", 4.4, main.east, main.west, main.height, 4.2, getBucket(kit, "roof"), getBucket(kit, "extTuff"));
  gableRoof("x", 4.4, -main.x, main.x, main.height, 4.2, getBucket(kit, "roof"), getBucket(kit, "extTuff"));

  // Թմբուկ (12 նիստ) և վեղարաձև գմբեթ, գագաթին՝ խաչ։
  kit.add("extTuff", cylinder(4, 4, 4.6, 12, 0, 12.6, 0, true));
  kit.add("roof", clean(new ConeGeometry(4.5, 3.4, 12, 1, true).translate(0, 17.2 + 1.7, 0), true));
  kit.add("roof", clean(new ShapeGeometry(circleShape(4.5), 6).rotateX(Math.PI / 2).translate(0, 17.2, 0)));
  kit.add("gold", box(0.14, 1.5, 0.14, 0, 20.5, 0), box(0.8, 0.14, 0.14, 0, 21.4, 0));
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 + Math.PI / 12;
    const n = new Vector3(Math.sin(a), 0, Math.cos(a));
    kit.add("extDark", arch(0.45, 1.5, n.clone().multiplyScalar(4 * Math.cos(Math.PI / 12) + 0.02).setY(14), n));
  }

  // Ճակատների պատուհաններ։
  const slit = (w: number, h: number, x: number, y: number, z: number, n: Vector3) => kit.add("extDark", arch(w, h, new Vector3(x, y, z).addScaledVector(n, 0.02), n));
  slit(0.55, 1.6, 0, 10.2, main.west, new Vector3(0, 0, 1));
  slit(0.55, 1.6, 0, 5.4, main.east, new Vector3(0, 0, -1));
  slit(0.5, 1.4, 0, 10.4, main.east, new Vector3(0, 0, -1));
  for (const s of [-1, 1]) {
    slit(0.55, 1.6, s * main.x, 10.2, 0, new Vector3(s, 0, 0));
    slit(0.5, 1.6, s * main.x, 5.2, 0, new Vector3(s, 0, 0));
    slit(0.5, 1.6, s * main.x, 5.4, 7.5, new Vector3(s, 0, 0));
  }

  // Գավիթ՝ մուտքով, վրան՝ զանգակատուն։
  kit.add("extTuff", box(gavit.x * 2, gavit.height, gavit.west - gavit.east, 0, 0, (gavit.west + gavit.east) / 2));
  gableRoof("x", 3, -gavit.x, gavit.x, gavit.height, 1.6, getBucket(kit, "roof"), getBucket(kit, "extTuff"), (gavit.west + gavit.east) / 2);
  slit(2, 3.1, 0, 0, gavit.west, new Vector3(0, 0, 1));
  kit.add("gold", box(0.08, 0.6, 0.04, 0, 3.5, gavit.west + 0.03), box(0.34, 0.08, 0.04, 0, 3.86, gavit.west + 0.03));
  for (const s of [-1, 1]) slit(0.5, 1.4, s * gavit.x, 2.6, 14.4, new Vector3(s, 0, 0));

  const bz = (gavit.west + gavit.east) / 2;
  kit.add("extTuff", box(3.2, 0.8, 3.2, 0, 7.4, bz));
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    kit.add("extTuff", cylinder(0.14, 0.16, 2.3, 8, 1.2 * Math.cos(a), 8.2, bz + 1.2 * Math.sin(a)));
  }
  kit.add("extTuff", cylinder(1.55, 1.55, 0.3, 12, 0, 10.5, bz, true));
  kit.add("roof", clean(new ConeGeometry(1.65, 1.5, 12).translate(0, 10.8 + 0.75, bz), true));
  kit.add("gold", box(0.08, 0.8, 0.08, 0, 12.3, bz), box(0.4, 0.08, 0.08, 0, 12.75, bz));
  kit.add("gold", lathe([[0.02, 0], [0.42, 0], [0.38, 0.08], [0.24, 0.5], [0.18, 0.75], [0.08, 0.82], [0, 0.82]], 16, 0, 9.1, bz));
  kit.add("gold", cylinder(0.02, 0.02, 0.6, 4, 0, 9.9, bz));
}

// ---------- Տեսարանը ----------

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export { webglAvailable };

export function createChurchScene(host: HTMLElement, options: {
  parts: readonly ChurchPart[];
  onPick: (id: string) => void;
}): ChurchScene {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new WebGLRenderer({ antialias: dpr < 2, alpha: true, powerPreference: "default" });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "church3d-canvas";
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight("#fff4e4", "#5a4038", 2.4));
  const sun = new DirectionalLight("#ffe7c2", 1.6);
  sun.position.set(-8, 22, 12);
  scene.add(sun);

  const materials = new Map<LookName, Material>();
  for (const [name, look] of Object.entries(LOOKS) as Array<[LookName, Look]>) materials.set(name, material(look));

  const interiorKit = new Kit();
  buildInterior(interiorKit);
  const interior = interiorKit.build(materials);
  const exteriorKit = new Kit();
  buildExterior(exteriorKit);
  const exterior = exteriorKit.build(materials);
  scene.add(interior, exterior);

  // Վարագույր՝ բաց (երկու կողմերում հավաքված) կամ փակ (ամբողջ լայնությամբ)։
  const fabric = materials.get("fabric")!;
  const drape = (x0: number, x1: number, amp: number, freq: number) => surface(Math.max(8, Math.round(Math.abs(x1 - x0) * 6)), 1,
    (u, v) => {
      const x = x0 + (x1 - x0) * u;
      return new Vector3(x, BEMA_HEIGHT + (8.65 - BEMA_HEIGHT) * v, BEMA_FRONT - 0.05 + amp * Math.sin(x * freq));
    }, constant(new Vector3(0, 0, 1)));
  const curtainOpen = new Mesh(mergeGeometries([drape(-4.1, -3.2, 0.12, 9), drape(3.2, 4.1, 0.12, 9)])!, fabric);
  const closedCross = mergeGeometries([box(0.12, 1.4, 0.2, 0, 4.6, BEMA_FRONT - 0.05), box(0.8, 0.12, 0.2, 0, 5.5, BEMA_FRONT - 0.05)])!;
  const curtainClosed = new Group();
  curtainClosed.add(new Mesh(drape(-4.1, 4.1, 0.07, 5), fabric), new Mesh(closedCross, materials.get("gold")));
  curtainClosed.visible = false;
  interior.add(curtainOpen, curtainClosed);

  // Քահանան (պարզ ուրվագիծ)՝ միայն «Պատարագից առաջ» քայլերում։
  const robe = new MeshLambertMaterial({ color: "#1e1b1f" });
  const priest = new Group();
  priest.add(new Mesh(new ConeGeometry(0.34, 1.5, 12), robe).translateY(0.75));
  priest.add(new Mesh(new SphereGeometry(0.14, 12, 8), new MeshLambertMaterial({ color: "#d9b79c" })).translateY(1.64));
  priest.visible = false;
  interior.add(priest);

  const camera = new PerspectiveCamera(45, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.rotateSpeed = 0.7;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI - 0.05;
  controls.maxDistance = 90;

  // Կետերը՝ սովորական կոճակներ canvas-ի վրա (հստակ տեքստ, մատով հեշտ սեղմվում են)։
  const overlay = document.createElement("div");
  overlay.className = "church3d-overlay";
  host.appendChild(overlay);
  const dots = options.parts.map((part) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "church3d-dot";
    button.setAttribute("aria-label", part.name);
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("span");
    label.textContent = part.name;
    button.appendChild(label);
    button.addEventListener("click", () => options.onPick(part.id));
    overlay.appendChild(button);
    return { part, button, at: new Vector3(...part.at), shown: true };
  });

  let mode: ViewMode = "cutaway";
  let frame = 0;
  let width = 1;
  let height = 1;
  const projected = new Vector3();

  function placeDots() {
    for (const dot of dots) {
      let show = dot.part.view === (mode === "cutaway" ? "inside" : "outside");
      if (show) {
        projected.copy(dot.at).project(camera);
        show = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
        if (show) dot.button.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
      }
      if (show !== dot.shown) {
        dot.button.hidden = !show;
        dot.shown = show;
      }
    }
  }

  function render() {
    frame = 0;
    renderer.render(scene, camera);
    placeDots();
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function focus(eye: Vec3, look: Vec3) {
    camera.position.set(...eye);
    controls.target.set(...look);
    controls.update();
    requestRender();
  }

  function applyMode(next: ViewMode) {
    mode = next;
    interior.visible = next === "cutaway";
    exterior.visible = next === "outside";
    controls.minDistance = next === "outside" ? 8 : 0.4;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Նեղ (ուղղահայաց) էկրանին տեսադաշտը լայնացնում ենք, որ շենքը տեղավորվի։
    camera.fov = camera.aspect < 1 ? Math.min(62, 45 / Math.sqrt(camera.aspect)) : 45;
    camera.updateProjectionMatrix();
    requestRender();
  }

  controls.addEventListener("change", requestRender);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyMode("cutaway");
  focus(DEFAULT_VIEW.cutaway.eye, DEFAULT_VIEW.cutaway.look);
  resize();

  return {
    setMode(next) {
      if (next === mode) return;
      applyMode(next);
      focus(DEFAULT_VIEW[next].eye, DEFAULT_VIEW[next].look);
    },
    focus,
    select(id) {
      for (const dot of dots) dot.button.setAttribute("aria-pressed", String(dot.part.id === id));
    },
    showTour(step) {
      priest.visible = Boolean(step);
      curtainOpen.visible = !step?.curtainClosed;
      curtainClosed.visible = Boolean(step?.curtainClosed);
      if (step) {
        priest.position.set(...step.priest);
        robe.color.set(step.vested ? "#b8862f" : "#1e1b1f");
        if (mode !== "cutaway") applyMode("cutaway");
        focus(step.eye, step.look);
      } else {
        requestRender();
      }
    },
    reset() {
      focus(DEFAULT_VIEW[mode].eye, DEFAULT_VIEW[mode].look);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      const disposed = new Set<Material>(materials.values());
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        disposed.add(object.material as Material);
      });
      for (const m of disposed) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
