// Անձնագրից (ChurchModel) → 3D երկրաչափություն։ Բեռնվում է միայն 3D էջում (three.js)։
// Արագության համար ամեն նյութի (գույնի) բոլոր մասերը միացվում են մեկ mesh-ում։
// Ներսի պատերը միակողմանի են և նայում են ներս. դրսից մոտակա պատերն ինքնին անտեսանելի են («կտրվածք»)։
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group,
  LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, RepeatWrapping, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace,
  TorusGeometry, Vector2, Vector3, type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  belfriesOf, bemaFront, bounds, candleSlot, domesOf, edgesOf, exteriorHit, offsetPolygon, openingCenters, pointOnEdge, polygonOf,
  type Arcade, type Balcony, type BaySide, type Bema, type Belfry, type ChurchLook, type ChurchModel, type Closure, type Dome, type Item,
  type Mass, type OpeningShape, type Pt, type Room, type TuffColor, type Vault,
} from "./model";

const UP = new Vector3(0, 1, 0);
const v3 = (p: Pt, y: number) => new Vector3(p[0], y, p[1]);
const h3 = (n: Pt) => new Vector3(n[0], 0, n[1]);

// ---------- Հիմնական ձևեր ----------

/** Միայն position + normal, առանց ինդեքսի, որ mergeGeometries-ը միացնի ամեն ինչ։ */
function clean(geometry: BufferGeometry, flat = false) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  if (plain !== geometry) geometry.dispose();
  for (const name of Object.keys(plain.attributes)) if (name !== "position" && name !== "normal") plain.deleteAttribute(name);
  if (flat || !plain.getAttribute("normal")) plain.computeVertexNormals();
  return plain;
}

/** Մակերես f(u,v)-ից. եռանկյունները շրջվում են այնպես, որ նայեն `normal(p)`-ի կողմը։ */
export function surface(nu: number, nv: number, f: (u: number, v: number) => Vector3, normal: (p: Vector3) => Vector3) {
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

function quad(a: Vector3, b: Vector3, y0: number, y1: number, n: Vector3) {
  return surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).setY(y0 + (y1 - y0) * v), constant(n));
}

/** Պատուհանի/դռան ձևը (local XY, հիմքի կենտրոնը՝ (0,0))։ */
export function openingShape(kind: OpeningShape, w: number, h: number) {
  const shape = new Shape();
  const r = w / 2;
  if (kind === "round") {
    shape.absarc(0, r, r, 0, Math.PI * 2, false);
  } else if (kind === "rect") {
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, h); shape.lineTo(-r, h); shape.lineTo(-r, 0);
  } else if (kind === "cross") {
    const t = w / 3;
    const y = h * 0.6;
    const pts: Array<[number, number]> = [[-t / 2, 0], [t / 2, 0], [t / 2, y - t / 2], [r, y - t / 2], [r, y + t / 2], [t / 2, y + t / 2], [t / 2, h], [-t / 2, h], [-t / 2, y + t / 2], [-r, y + t / 2], [-r, y - t / 2], [-t / 2, y - t / 2]];
    shape.moveTo(...pts[0]);
    for (const p of pts.slice(1)) shape.lineTo(...p);
  } else {
    const half = kind === "slit" ? r * 0.5 : r;
    shape.moveTo(-half, 0); shape.lineTo(half, 0); shape.lineTo(half, h - half);
    shape.absarc(0, h - half, half, 0, Math.PI, false);
    shape.lineTo(-half, 0);
  }
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

function panel(kind: OpeningShape, w: number, h: number, at: Vector3, n: Vector3) {
  return place(clean(new ShapeGeometry(openingShape(kind, w, h), 6)), at, n);
}

function circleShape(r: number) {
  const shape = new Shape();
  shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  return shape;
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

/** Հատակի ձև → հորիզոնական մակերես `y` բարձրության վրա, դեմքով վեր կամ վար։ */
function flatShape(points: readonly Pt[], y: number, facing: "up" | "down") {
  const shape = new Shape(points.map(([x, z]) => new Vector2(x, facing === "up" ? -z : z)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(facing === "up" ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0);
  return clean(geometry);
}

// ---------- Նյութեր ----------

type Look = { color: string; gradient?: boolean; emissive?: string; basic?: boolean; double?: boolean };
const LOOKS = {
  tuff: { color: "#ffffff", gradient: true },
  floor: { color: "#bcae9f" },
  stone: { color: "#cdb8a6" },
  carpet: { color: "#7a2a2c" },
  marble: { color: "#f1e9dc" },
  wood: { color: "#6e4b33" },
  gold: { color: "#d2a850", emissive: "#4a3410" },
  fabric: { color: "#8e1f28", double: true },
  glow: { color: "#fff0cc", basic: true },
  icon: { color: "#34476f" },
  niche: { color: "#5d453d" },
  water: { color: "#9cc6d8", basic: true },
  sand: { color: "#d9c69c" },
  extTuff: { color: "#ffffff", gradient: true },
  roof: { color: "#8a5848" },
  /** Գմբեթի և զանգակատան գլխիկները՝ միշտ քարե։ */
  capRoof: { color: "#8a5848" },
  basalt: { color: "#ffffff", gradient: true },
  extDark: { color: "#33241f", basic: true },
} satisfies Record<string, Look>;
export type LookName = keyof typeof LOOKS;

/** Տուֆի գույնը ներսում (սվաղ/քար) և դրսում, ներքևից վերև։ */
const TUFF: Record<TuffColor, { inLow: string; inHigh: string; outLow: string; outHigh: string; roof: string }> = {
  pink: { inLow: "#9a776a", inHigh: "#f3e2d2", outLow: "#a3654e", outHigh: "#e0a98b", roof: "#8a5848" },
  ochre: { inLow: "#9c8566", inHigh: "#f2e6cf", outLow: "#a07a45", outHigh: "#e3c08a", roof: "#8d6a3f" },
  gray: { inLow: "#85807a", inHigh: "#ece8e2", outLow: "#6f6a64", outHigh: "#c4bdb4", roof: "#5e5a55" },
  black: { inLow: "#6a625e", inHigh: "#ddd6cf", outLow: "#3b3533", outHigh: "#756b66", roof: "#3c3533" },
};
const TILE = "#a5492f";
const BASALT = "#5f5a56";

// Քարաշարի նկարը՝ մեկ փոքր նկար (DataTexture), որ կրկնվում է պատերի վրա. չափերը մետրով։
const STONE_W = 0.9;
const STONE_H = 0.45;
const STONES_X = 8;
const STONES_Y = 8;
const TILE_W = 0.3;
const TILE_H = 0.42;

function texture(width: number, height: number, pixel: (x: number, y: number) => Color) {
  const data = new Uint8Array(width * height * 4);
  const rgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Color-ը ներսում գծային է, նկարը՝ sRGB։
      pixel(x, y).getRGB(rgb, SRGBColorSpace);
      data.set([Math.round(Math.min(1, rgb.r) * 255), Math.round(Math.min(1, rgb.g) * 255), Math.round(Math.min(1, rgb.b) * 255), 255], (y * width + x) * 4);
    }
  }
  const map = new DataTexture(data, width, height);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.colorSpace = SRGBColorSpace;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** Քարերի հերթական փոքր տարբերություն (կրկնվող, բայց ոչ միապաղաղ)։ */
const jitter = (i: number, j: number) => { const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return h - Math.floor(h) - 0.5; };

function masonryTexture(main: string, accent: string, masonry: NonNullable<ChurchLook["masonry"]>) {
  const px = 32;
  const a = new Color(main);
  const b = new Color(accent);
  const mortar = 2;
  return texture(STONES_X * px * 2, STONES_Y * px, (x, y) => {
    const row = Math.floor(y / px);
    const shift = masonry === "checker" ? 0 : (row % 2) * px;
    const col = Math.floor(((x + shift) % (STONES_X * px * 2)) / (px * 2));
    const inX = (x + shift) % (px * 2);
    const inY = y % px;
    const second = masonry === "checker" ? (col + row) % 2 === 1 : masonry === "bands" ? row % 3 === 2 : false;
    const c = (second ? b : a).clone().multiplyScalar(1 + jitter(col, row) * 0.12);
    if (inX < mortar || inY < mortar) c.multiplyScalar(0.8);
    return c;
  });
}

function tileTexture(color: string) {
  const base = new Color(color);
  const w = 32;
  const h = 32;
  return texture(w * 2, h * 2, (x, y) => {
    const channel = Math.cos(((x % w) / w) * Math.PI * 2) * 0.5 + 0.5;
    const c = base.clone().multiplyScalar(0.78 + 0.3 * channel + jitter(Math.floor(x / w), Math.floor(y / h)) * 0.08);
    if (y % h < 3) c.multiplyScalar(0.62);
    return c;
  });
}

export function createMaterials(tuff: TuffColor, look: ChurchLook = {}) {
  const materials = new Map<LookName, Material>();
  const outside = TUFF[tuff];
  const walls = masonryTexture(outside.outHigh, TUFF[look.accent ?? "black"].outHigh, look.masonry ?? "plain");
  const basalt = masonryTexture(BASALT, BASALT, "plain");
  const tiles = look.roof === "tile" ? tileTexture(TILE) : null;
  for (const [name, entry] of Object.entries(LOOKS) as Array<[LookName, Look]>) {
    const side = entry.double ? { side: DoubleSide } : {};
    const color = name === "capRoof" ? outside.roof : name === "roof" ? (tiles ? "#ffffff" : outside.roof) : entry.color;
    const map = name === "extTuff" ? walls : name === "basalt" ? basalt : name === "roof" ? tiles : null;
    materials.set(name, entry.basic
      ? new MeshBasicMaterial({ color, ...side })
      : new MeshLambertMaterial({ color, map, emissive: entry.emissive ?? "#000000", vertexColors: Boolean(entry.gradient), ...side }));
  }
  return materials;
}

/** Ներքևում մուգ, վերևում բաց (պատերի «լույսը» առանց ստվերների)։ */
function tint(geometry: BufferGeometry, low: Color, high: Color, top: number) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    c.copy(low).lerp(high, Math.sqrt(Math.min(1, Math.max(0, y / top))));
    if (y < 1.2) c.multiplyScalar(0.82 + 0.18 * (Math.max(0, y) / 1.2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/** Գույնի պայծառությունը (մոխրագույն), որ դրսի գրադիենտը բազմապատկվի քարաշարի նկարի վրա։ */
function shade(color: string, against: string) {
  const l = (c: Color) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const k = Math.min(1, l(new Color(color)) / l(new Color(against)));
  return new Color(k, k, k);
}

/**
 * Նկարի կոորդինատներ (uv) մետրով. պատերին՝ պատի երկայնքով և բարձրությամբ (քարաշարը հորիզոնական է ամենուր),
 * տանիքին՝ թեքության երկայնքով։
 */
function worldUV(geometry: BufferGeometry, kind: "wall" | "roof") {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const h = Math.hypot(nx, nz);
    let u: number;
    let v: number;
    if (kind === "wall") {
      if (Math.abs(ny) < 0.7 && h > 1e-6) { u = (x * -nz + z * nx) / h / (STONE_W * STONES_X); v = y / (STONE_H * STONES_Y); }
      else { u = x / (STONE_W * STONES_X); v = z / (STONE_H * STONES_Y); }
    } else if (h > 0.05) {
      const dx = nx / h;
      const dz = nz / h;
      u = (x * -dz + z * dx) / (TILE_W * 2);
      v = (x * dx + z * dz) / Math.max(0.3, Math.abs(ny)) / (TILE_H * 2);
    } else { u = x / (TILE_W * 2); v = z / (TILE_H * 2); }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
}

export class Kit {
  readonly buckets = new Map<LookName, BufferGeometry[]>();
  /** Բոցերի և լամպերի շողի կետերը (մեկ draw call-ով նկարվում են scene.ts-ում)։ */
  readonly glows = { small: [] as Vector3[], large: [] as Vector3[] };
  add(look: LookName, ...geometries: BufferGeometry[]) {
    const bucket = this.buckets.get(look) ?? [];
    bucket.push(...geometries);
    this.buckets.set(look, bucket);
  }
  build(materials: Map<LookName, Material>, tuff: TuffColor, top: number) {
    const group = new Group();
    const colors = TUFF[tuff];
    for (const [look, parts] of this.buckets) {
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      if (look === "tuff") tint(merged, new Color(colors.inLow), new Color(colors.inHigh), top);
      if (look === "extTuff" || look === "basalt") {
        // Ցոկոլը ցածր է. նրա համար գրադիենտը չենք մգացնում։
        tint(merged, look === "basalt" ? new Color(0.95, 0.95, 0.95) : shade(colors.outLow, colors.outHigh), new Color(1, 1, 1), look === "basalt" ? 1 : top);
        worldUV(merged, "wall");
      }
      if (look === "roof") worldUV(merged, "roof");
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, materials.get(look));
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

// ---------- Ներսը՝ պատեր, կամարներ, գմբեթ ----------

function roomShell(kit: Kit, room: Room) {
  const edges = edgesOf(room.outline);
  for (const edge of edges) {
    if (room.open?.includes(edge.index)) continue;
    const height = room.heights?.[edge.index] ?? room.height;
    // Դռներն ու որմնախորշերը պատի մեջ բացվածք են (կոր պատերին՝ ոչ)։
    const doors = [...(room.doors ?? []), ...(room.niches ?? [])].filter((door) => door.edge === edge.index && !edge.bulge);
    for (let i = 0; i < edge.pts.length - 1; i++) {
      const a = v3(edge.pts[i], 0);
      const b = v3(edge.pts[i + 1], 0);
      const n = h3(edge.inward[i]);
      if (!doors.length) {
        kit.add("tuff", quad(a, b, 0, height, n));
        continue;
      }
      const dir = new Vector3().subVectors(b, a).normalize();
      const total = a.distanceTo(b);
      const at = (s: number) => a.clone().addScaledVector(dir, s);
      let cursor = 0;
      for (const door of [...doors].sort((p, q) => p.at - q.at)) {
        const from = Math.max(0, door.at - door.w / 2);
        const to = Math.min(total, door.at + door.w / 2);
        if (from > cursor) kit.add("tuff", quad(at(cursor), at(from), 0, height, n));
        kit.add("tuff", quad(at(from), at(to), door.h, height, n));
        cursor = to;
      }
      if (cursor < total) kit.add("tuff", quad(at(cursor), at(total), 0, height, n));
    }
    for (const window of room.windows ?? []) {
      if (window.edge !== edge.index) continue;
      for (const s of openingCenters(window)) {
        const { p, n } = pointOnEdge(edge, s);
        kit.add("glow", panel(window.shape ?? "arch", window.w, window.h, v3(p, window.y).addScaledVector(h3(n), 0.03), h3(n)));
      }
    }
  }
  for (const niche of room.niches ?? []) {
    const edge = edges[niche.edge];
    if (edge && !edge.bulge) recess(kit, edge, niche, room.heights?.[niche.edge] ?? room.height);
  }
  const polygon = polygonOf(room.outline);
  kit.add("floor", flatShape(polygon, 0, "up"));
  if (room.ceiling === "flat") kit.add("tuff", flatShape(polygon, room.height, "down"));
  for (const patch of room.ceilings ?? []) kit.add("tuff", flatShape(patch, room.height, "down"));
  for (const apse of room.apses ?? []) {
    const edge = edges[apse.edge];
    if (!edge?.bulge) continue;
    const spring = room.heights?.[apse.edge] ?? room.height;
    const mid = v3([(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2], spring);
    const u = new Vector3(edge.b[0] - edge.a[0], 0, edge.b[1] - edge.a[1]);
    const hw = u.length() / 2;
    u.normalize();
    const out = h3(edge.out);
    kit.add("tuff", surface(8, 12, (s, t) => {
      const e = (Math.PI / 2) * s;
      const th = Math.PI * t;
      return mid.clone().addScaledVector(u, -hw * Math.cos(th) * Math.cos(e)).addScaledVector(out, edge.bulge * Math.sin(th) * Math.cos(e)).addScaledVector(UP, hw * Math.sin(e));
    }, (p) => mid.clone().sub(p).normalize()));
  }
}

/** Որմնախորշի փոսը՝ հետևի պատ, կողքեր, հատակ և առաստաղ (կամար կամ հարթ)։ Կամարի դեպքում պատի հարթությունում՝ անկյունները։ */
function recess(kit: Kit, edge: ReturnType<typeof edgesOf>[number], niche: { at: number; w: number; h: number; depth: number; arch?: boolean }, wallHeight: number) {
  const dir = new Vector3(edge.b[0] - edge.a[0], 0, edge.b[1] - edge.a[1]).normalize();
  const n = h3(edge.inward[0]);
  const back = n.clone().multiplyScalar(-niche.depth);
  const base = v3(edge.a, 0).addScaledVector(dir, niche.at);
  const a = base.clone().addScaledVector(dir, -niche.w / 2);
  const b = base.clone().addScaledVector(dir, niche.w / 2);
  const hw = niche.w / 2;
  const spring = niche.arch ? Math.max(0.3, Math.min(niche.h, wallHeight) - hw) : Math.min(niche.h, wallHeight);
  kit.add("tuff", quad(a.clone().add(back), b.clone().add(back), 0, spring, n));
  kit.add("tuff", quad(a, a.clone().add(back), 0, spring, dir), quad(b, b.clone().add(back), 0, spring, dir.clone().negate()));
  kit.add("floor", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).addScaledVector(back, v).setY(0.005), constant(UP)));
  if (niche.arch) {
    const c0 = base.clone().setY(spring);
    const c1 = base.clone().add(back).setY(spring);
    kit.add("tuff", surface(2, 12, (u, v) => {
      const t = Math.PI * v;
      return new Vector3().lerpVectors(c0, c1, u).addScaledVector(dir, hw * Math.cos(t)).addScaledVector(UP, hw * Math.sin(t));
    }, (p) => { const q = c0.clone().addScaledVector(n, new Vector3().subVectors(p, c0).dot(n)); return q.sub(p).normalize(); }));
    kit.add("tuff", closure(c1, dir, hw, hw, true, n));
    kit.add("tuff", ...spandrels(c0, dir, hw, hw, Math.min(niche.h, wallHeight) - spring, n));
  } else {
    kit.add("tuff", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).addScaledVector(back, v).setY(spring), constant(UP.clone().negate())));
  }
}

/** Կամարի ծայրի փակումը՝ արտաքին կիսաշրջանի և (եթե կա) ներքին բացվածքի միջև։ */
function closure(center: Vector3, across: Vector3, hw: number, rise: number, close: Closure, n: Vector3) {
  const hole = close === true ? { hole: 0, rise: 0 } : close;
  return surface(1, 16, (u, v) => {
    const t = Math.PI * v;
    const outer = new Vector3().addScaledVector(across, hw * Math.cos(t)).addScaledVector(UP, rise * Math.sin(t));
    const inner = new Vector3().addScaledVector(across, hole.hole * Math.cos(t)).addScaledVector(UP, hole.rise * Math.sin(t));
    return center.clone().add(inner.lerp(outer, u));
  }, constant(n));
}

function vault(kit: Kit, vault: Vault) {
  const start = v3(vault.from, vault.spring);
  const end = v3(vault.to, vault.spring);
  const axis = new Vector3().subVectors(end, start);
  const dir = axis.clone().normalize();
  const across = new Vector3(-dir.z, 0, dir.x);
  const hw = vault.width / 2;
  const rise = vault.rise ?? hw;
  kit.add("tuff", surface(Math.max(1, Math.round(axis.length() / 4)), 16, (u, v) => {
    const t = Math.PI * v;
    return new Vector3().lerpVectors(start, end, u).addScaledVector(across, hw * Math.cos(t)).addScaledVector(UP, rise * Math.sin(t));
  }, (p) => {
    const t = new Vector3().subVectors(p, start).dot(axis) / axis.lengthSq();
    return new Vector3().lerpVectors(start, end, t).sub(p).normalize();
  }));
  if (vault.closeFrom) kit.add("tuff", closure(start, across, hw, rise, vault.closeFrom, dir.clone()));
  if (vault.closeTo) kit.add("tuff", closure(end, across, hw, rise, vault.closeTo, dir.clone().negate()));
}

/** Կամարի ու ուղղանկյան միջև (առագաստ կամ սյունաշարի պատ)՝ էլիպսաձև կամարով, մի կողմի համար։ */
function spandrels(center: Vector3, across: Vector3, hw: number, rise: number, height: number, n: Vector3) {
  return [1, -1].map((mirror) => surface(1, 8, (u, v) => {
    const t = (Math.PI / 2) * v;
    const dx = hw * Math.cos(t);
    const dy = rise * Math.sin(t);
    const k = Math.min(dx > 1e-6 ? hw / dx : Infinity, dy > 1e-6 ? height / dy : Infinity);
    const s = 1 + (k - 1) * u;
    return center.clone().addScaledVector(across, mirror * dx * s).addScaledVector(UP, dy * s);
  }, constant(n)));
}

function arcade(kit: Kit, arcade: Arcade) {
  const a = v3(arcade.from, 0);
  const b = v3(arcade.to, 0);
  const dir = new Vector3().subVectors(b, a).normalize();
  const side = new Vector3(-dir.z, 0, dir.x);
  const total = a.distanceTo(b);
  const step = total / (arcade.count - 1);
  const half = arcade.pillar / 2;
  for (let i = 0; i < arcade.count; i++) {
    const p = a.clone().addScaledVector(dir, step * i);
    const pillar = new BoxGeometry(arcade.pillar, arcade.spring, arcade.pillar).translate(0, arcade.spring / 2, 0);
    pillar.applyMatrix4(new Matrix4().makeRotationY(Math.atan2(dir.x, dir.z)).setPosition(p));
    kit.add("tuff", clean(pillar));
  }
  for (let i = 0; i < arcade.count - 1; i++) {
    const p0 = a.clone().addScaledVector(dir, step * i + half);
    const p1 = a.clone().addScaledVector(dir, step * (i + 1) - half);
    const hw = p0.distanceTo(p1) / 2;
    const rise = Math.min(hw, arcade.top - arcade.spring - 0.4);
    for (const s of [1, -1]) {
      const n = side.clone().multiplyScalar(s);
      const c = new Vector3().lerpVectors(p0, p1, 0.5).addScaledVector(n, half).setY(arcade.spring);
      kit.add("tuff", ...spandrels(c, dir, hw, rise, arcade.top - arcade.spring, n));
    }
    // Կամարի ներքևի կորը (սյուների միջև)։
    const c = new Vector3().lerpVectors(p0, p1, 0.5).setY(arcade.spring);
    kit.add("tuff", surface(1, 12, (u, v) => {
      const t = Math.PI * v;
      return c.clone().addScaledVector(side, (u - 0.5) * arcade.pillar).addScaledVector(dir, hw * Math.cos(t)).addScaledVector(UP, rise * Math.sin(t));
    }, (p) => c.clone().addScaledVector(side, new Vector3().subVectors(p, c).dot(side)).sub(p).normalize()));
  }
}

const BAY_SIDES: Record<BaySide, { n: Vector3; across: Vector3; offset: (b: number) => Vector3 }> = {
  "x+": { n: new Vector3(-1, 0, 0), across: new Vector3(0, 0, 1), offset: (b) => new Vector3(b, 0, 0) },
  "x-": { n: new Vector3(1, 0, 0), across: new Vector3(0, 0, 1), offset: (b) => new Vector3(-b, 0, 0) },
  "z+": { n: new Vector3(0, 0, -1), across: new Vector3(1, 0, 0), offset: (b) => new Vector3(0, 0, b) },
  "z-": { n: new Vector3(0, 0, 1), across: new Vector3(1, 0, 0), offset: (b) => new Vector3(0, 0, -b) },
};

/** Թմբուկի պատուհանների ուղղությունները (նույնը ներսում և դրսում)։ */
function drumDirections(dome: Dome) {
  const count = dome.windows?.count ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const t = (Math.PI * 2 * (i + 0.5)) / count;
    return new Vector3(Math.sin(t), 0, Math.cos(t));
  });
}

function domeInside(kit: Kit, dome: Dome) {
  const c = v3(dome.at, 0);
  const r = dome.radius;
  const top = dome.base + dome.drum;
  if (dome.bay) {
    const b = dome.bay;
    const spring = dome.base - b;
    for (const [side, spec] of Object.entries(BAY_SIDES) as Array<[BaySide, (typeof BAY_SIDES)[BaySide]]>) {
      const center = c.clone().add(spec.offset(b)).setY(spring);
      kit.add("tuff", ...spandrels(center, spec.across, b, b, b, spec.n));
      if (dome.closed?.includes(side)) kit.add("tuff", closure(center, spec.across, b, b, true, spec.n));
    }
    const shape = new Shape([new Vector2(-b, -b), new Vector2(b, -b), new Vector2(b, b), new Vector2(-b, b)]);
    const hole = new Shape();
    hole.absarc(0, 0, r, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    kit.add("tuff", clean(new ShapeGeometry(shape, 24).rotateX(Math.PI / 2).translate(c.x, dome.base, c.z)));
  } else if (dome.collar) {
    // Հարթ առաստաղ՝ թմբուկի բացվածքով (կլոր կամ հարթ առաստաղով դահլիճի վրա)։
    const shape = new Shape(dome.collar.map(([x, z]) => new Vector2(x - c.x, z - c.z)));
    const hole = new Shape();
    hole.absarc(0, 0, r, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    kit.add("tuff", clean(new ShapeGeometry(shape, 24).rotateX(Math.PI / 2).translate(c.x, dome.base, c.z)));
  }
  kit.add("tuff", surface(1, 24, (u, v) => {
    const a = Math.PI * 2 * v;
    return new Vector3(c.x + r * Math.cos(a), dome.base + dome.drum * u, c.z + r * Math.sin(a));
  }, (p) => new Vector3(c.x - p.x, 0, c.z - p.z).normalize()));
  const center = c.clone().setY(top);
  kit.add("tuff", surface(8, 24, (u, v) => {
    const e = (Math.PI / 2) * u;
    const a = Math.PI * 2 * v;
    return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).multiplyScalar(r).add(center);
  }, (p) => center.clone().sub(p).normalize()));
  const w = dome.windows;
  if (w) {
    for (const d of drumDirections(dome)) {
      kit.add("glow", panel(w.shape ?? "arch", w.w, w.h, c.clone().addScaledVector(d, r - 0.05).setY(dome.base + 0.9), d.clone().negate()));
    }
  }
}

// ---------- Բեմ, պատշգամբ ----------

function orientedBox(w: number, h: number, d: number, at: Pt, y: number, angle: number) {
  const geometry = new BoxGeometry(w, h, d).translate(0, h / 2, 0);
  geometry.applyMatrix4(new Matrix4().makeRotationY(angle).setPosition(at[0], y, at[1]));
  return clean(geometry);
}

function bema(kit: Kit, bema: Bema) {
  const polygon = polygonOf(bema.outline);
  const { mid, length, u, f } = bemaFront(bema);
  const angle = Math.atan2(f[0], f[1]);
  const at = (along: number, forward: number): Pt => [mid[0] + u[0] * along + f[0] * forward, mid[1] + u[1] * along + f[1] * forward];
  kit.add("stone", flatShape(polygon, bema.height, "up"));
  for (const edge of edgesOf(bema.outline)) {
    for (let i = 0; i < edge.pts.length - 1; i++) {
      kit.add("stone", quad(v3(edge.pts[i], 0), v3(edge.pts[i + 1], 0), 0, bema.height, h3(edge.inward[i]).negate()));
    }
  }
  const carpet = [at(-length * 0.32, -0.3), at(length * 0.32, -0.3), at(length * 0.32, -2.3), at(-length * 0.32, -2.3)];
  kit.add("carpet", flatShape(carpet, bema.height + 0.01, "up"));
  kit.add("gold", orientedBox(length, 0.06, 0.06, at(0, 0.03), bema.height - 0.06, angle));

  const stairs = bema.stairs === "sides" ? [-(length / 2 - 0.7), length / 2 - 0.7] : [0];
  const width = bema.stairs === "sides" ? 0.9 : 1.6;
  for (const along of stairs) {
    for (let i = 0; i < 4; i++) kit.add("stone", orientedBox(width, (bema.height * (4 - i)) / 4, 0.42, at(along, 0.21 + 0.42 * i), 0, angle));
  }
  if (bema.atyan) {
    const { width: aw, depth, height } = bema.atyan;
    kit.add("stone", orientedBox(aw, height, depth, at(0, depth / 2), 0, angle));
    kit.add("carpet", orientedBox(aw - 0.6, 0.01, depth - 0.4, at(0, depth / 2), height, angle));
  }
  // Վարագույրի ձող։
  kit.add("gold", orientedBox(length + 0.4, 0.1, 0.1, at(0, -0.05), bema.curtainTop, angle));
}

/** Վարագույր՝ բաց (երկու կողմերում հավաքված) և փակ (ամբողջ լայնությամբ)։ */
export function curtains(bema: Bema) {
  const { mid, length, u, f } = bemaFront(bema);
  const base = v3(mid, 0).addScaledVector(h3(f), -0.05);
  const U = h3(u);
  const F = h3(f);
  const drape = (from: number, to: number, amp: number, freq: number) => surface(Math.max(8, Math.round(Math.abs(to - from) * 6)), 1, (s, t) => {
    const along = from + (to - from) * s;
    return base.clone().addScaledVector(U, along).addScaledVector(F, amp * Math.sin(along * freq)).setY(bema.height + (bema.curtainTop - bema.height) * t);
  }, constant(F));
  const half = length / 2 + 0.1;
  const open = mergeGeometries([drape(-half, -half + 0.9, 0.12, 9), drape(half - 0.9, half, 0.12, 9)])!;
  const closed = drape(-half, half, 0.07, 5);
  const midY = bema.height + (bema.curtainTop - bema.height) * 0.5;
  const angle = Math.atan2(f[0], f[1]);
  const cross = mergeGeometries([
    orientedBox(0.12, 1.4, 0.2, [base.x, base.z], midY - 0.7, angle),
    orientedBox(0.8, 0.12, 0.2, [base.x, base.z], midY + 0.2, angle),
  ])!;
  return { open, closed, cross };
}

function balcony(kit: Kit, model: ChurchModel, balcony: Balcony) {
  const polygon = polygonOf(balcony.outline);
  const y = balcony.floor;
  kit.add("wood", flatShape(polygon, y, "up"));
  kit.add("tuff", flatShape(polygon, y - 0.3, "down"));
  const walls = model.rooms.flatMap((room) => edgesOf(room.outline));
  const onWall = (p: Pt) => walls.some((edge) => edge.pts.some((q, i) => {
    const r = edge.pts[i + 1];
    if (!r) return false;
    const dx = r[0] - q[0];
    const dz = r[1] - q[1];
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - q[0] - dx * t, p[1] - q[1] - dz * t) < 0.15;
  }));
  for (const edge of edgesOf(balcony.outline)) {
    for (let i = 0; i < edge.pts.length - 1; i++) {
      const p = edge.pts[i];
      const q = edge.pts[i + 1];
      const m: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (onWall(m)) continue;
      const n = h3(edge.inward[i]).negate();
      kit.add("stone", quad(v3(p, 0), v3(q, 0), y - 0.3, y, n));
      // Բազրիք և սյուներ ազատ եզրի տակ։
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const angle = Math.atan2(q[0] - p[0], q[1] - p[1]);
      kit.add("wood", orientedBox(0.08, 0.95, len, m, y, angle), orientedBox(0.14, 0.06, len + 0.06, m, y + 0.95, angle));
      const posts = Math.max(1, Math.round(len / 3));
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        const c: Pt = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        if (onWall(c)) continue;
        kit.add("tuff", cylinder(0.18, 0.2, y - 0.3, 10, c[0], 0, c[1]));
      }
    }
  }
  if (balcony.stairs) {
    const { at, dir, width } = balcony.stairs;
    const count = Math.ceil(y / 0.2);
    const depth = 0.3;
    const angle = Math.atan2(dir[0], dir[1]);
    for (let i = 0; i < count; i++) {
      const c: Pt = [at[0] + dir[0] * depth * (i + 0.5), at[1] + dir[1] * depth * (i + 0.5)];
      kit.add("stone", orientedBox(width, (y * (i + 1)) / count, depth, c, 0, angle));
    }
  }
}

// ---------- Պարագաներ ----------

/** Բարակ ձող a-ից b (շղթա, թել)։ */
function rod(a: Vector3, b: Vector3, r: number, segments = 4) {
  const geometry = new CylinderGeometry(r, r, a.distanceTo(b), segments, 1, true);
  const dir = new Vector3().subVectors(b, a).normalize();
  geometry.applyMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(UP, dir)).setPosition(new Vector3().lerpVectors(a, b, 0.5)));
  return clean(geometry);
}

/** Երկկողմանի հարթ ձև (քշոց, թափորի սրբապատկեր)՝ նույն ձևը առջևից և հետևից։ */
function twoSided(shape: Shape, at: Vector3, offset = 0.004) {
  return [
    place(clean(new ShapeGeometry(shape, 8)), at.clone().setZ(at.z + offset), new Vector3(0, 0, 1)),
    place(clean(new ShapeGeometry(shape, 8)), at.clone().setZ(at.z - offset), new Vector3(0, 0, -1)),
  ];
}

function crossShape(size: number) {
  const t = size * 0.22;
  const shape = new Shape();
  const pts: Array<[number, number]> = [[-t / 2, -size / 2], [t / 2, -size / 2], [t / 2, size * 0.12], [size * 0.32, size * 0.12], [size * 0.32, size * 0.12 + t], [t / 2, size * 0.12 + t], [t / 2, size / 2], [-t / 2, size / 2], [-t / 2, size * 0.12 + t], [-size * 0.32, size * 0.12 + t], [-size * 0.32, size * 0.12], [-t / 2, size * 0.12]];
  shape.moveTo(...pts[0]);
  for (const p of pts.slice(1)) shape.lineTo(...p);
  return shape;
}

/** Պարագայի կտորները և լույսերի կետերը՝ իր տեղում (դեմքը +Z, հատակը y=0)։ `detail`՝ մանրամասն դիտման համար։ */
export function itemParts(item: Item, detail: boolean) {
  const local = new Kit();
  const seg = detail ? 40 : 12;
  const flame = (x: number, y: number, z: number, big = false) => {
    local.add("glow", box(big ? 0.07 : 0.03, big ? 0.14 : 0.07, big ? 0.07 : 0.03, x, y, z));
    (big ? local.glows.large : local.glows.small).push(new Vector3(x, y + (big ? 0.07 : 0.035), z));
  };
  switch (item.type) {
    case "altar": {
      local.add("marble", box(2, 1.05, 1.1, 0, 0, 0));
      local.add("fabric", box(1.9, 0.8, 0.02, 0, 0.16, 0.56));
      local.add("gold", box(0.06, 0.5, 0.025, 0, 0.3, 0.58), box(0.32, 0.06, 0.025, 0, 0.6, 0.58));
      for (let k = 0; k < 3; k++) {
        const h = 1.25 + 0.3 * k;
        const z = -0.75 - 0.35 * k;
        local.add("marble", box(2.4 - 0.3 * k, h, 0.35, 0, 0, z));
        for (const x of [-0.95, -0.55, 0.55, 0.95].map((v) => v * (1 - 0.12 * k))) {
          local.add("marble", cylinder(0.03, 0.03, 0.32, 6, x, h, z));
          flame(x, h + 0.33, z);
        }
      }
      local.add("gold", box(0.08, 0.85, 0.08, 0, 1.85, -1.45), box(0.46, 0.08, 0.08, 0, 2.4, -1.45));
      break;
    }
    case "lectern": {
      local.add("wood", cylinder(0.05, 0.07, 0.95, 8, 0, 0, 0));
      local.add("wood", clean(new BoxGeometry(0.62, 0.04, 0.46).rotateX(0.45).translate(0, 1.01, 0)));
      local.add("gold", clean(new BoxGeometry(0.34, 0.05, 0.3).rotateX(0.45).translate(0, 1.05, 0)));
      break;
    }
    case "font": {
      if (item.niche) local.add("niche", panel("arch", 1.7, 2.7, new Vector3(0, 0, -0.76), new Vector3(0, 0, 1)));
      local.add("stone", lathe([[0, 0], [0.36, 0], [0.36, 0.1], [0.2, 0.22], [0.16, 0.6], [0.5, 0.75], [0.56, 1.0], [0.48, 1.02], [0.42, 0.86], [0, 0.86]], seg + 6, 0, 0, 0));
      local.add("water", place(clean(new ShapeGeometry(circleShape(0.42), 12)), new Vector3(0, 0.88, 0), UP));
      break;
    }
    case "candle-table": {
      local.add("stone", box(1.4, 0.75, 0.8, 0, 0, 0));
      local.add("sand", box(1.3, 0.04, 0.7, 0, 0.75, 0));
      // Եկեղեցում մոմերը իրական են (այսօր վառվածները, scene.ts-ի setCandles), մանրամասն դիտման մեջ՝ օրինակ։
      if (detail) {
        for (const i of [3, 8, 14, 19, 22, 27, 33, 38, 41, 47, 52, 56]) {
          const [x, h, z] = candleSlot(i);
          local.add("marble", cylinder(0.012, 0.012, h, 8, x, 0.79, z));
          flame(x, 0.79 + h, z);
        }
      }
      break;
    }
    case "chandelier": {
      const top = (item.top ?? (item.y ?? 0) + 3) - (item.y ?? 0);
      local.add("gold", clean(new TorusGeometry(1.6, 0.05, 6, detail ? 64 : 36).rotateX(Math.PI / 2)));
      local.add("gold", cylinder(0.03, 0.03, top, 6, 0, 0, 0));
      for (const a of [0, Math.PI / 2]) local.add("gold", clean(new BoxGeometry(3.2, 0.04, 0.04).rotateY(a)));
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        flame(1.6 * Math.cos(a), 0.05, 1.6 * Math.sin(a), true);
      }
      break;
    }
    case "choir": {
      // Դաս՝ ցածր հարթակ, առջևի ցանկապատ և երգի կանգնակներ։
      local.add("wood", box(3, 0.15, 2.2, 0, 0, 0));
      local.add("wood", box(3, 0.85, 0.08, 0, 0.15, 1.06));
      for (const x of [-1, 0, 1]) {
        local.add("wood", cylinder(0.035, 0.05, 1.05, 6, x, 0.15, 0.55));
        local.add("wood", clean(new BoxGeometry(0.5, 0.03, 0.36).rotateX(-0.5).translate(x, 1.25, 0.55)));
      }
      break;
    }
    case "icon": {
      // Սրբապատկեր՝ միայն շրջանակ, ֆոն և խաչ (առանց պատկերման)։
      const w = item.w ?? 1.2;
      const h = item.h ?? 1.8;
      local.add("gold", panel("arch", w + 0.2, h + 0.2, new Vector3(0, -0.1, 0.01), new Vector3(0, 0, 1)));
      local.add("icon", panel("arch", w, h, new Vector3(0, 0, 0.03), new Vector3(0, 0, 1)));
      const s = Math.min(w, h) * 0.32;
      local.add("gold", place(clean(new ShapeGeometry(crossShape(s))), new Vector3(0, h * 0.45, 0.04), new Vector3(0, 0, 1)));
      break;
    }
    case "bench": {
      const w = item.w ?? 2.4;
      local.add("wood", box(w, 0.06, 0.42, 0, 0.44, 0), box(w, 0.5, 0.05, 0, 0.5, -0.2));
      for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) local.add("wood", box(0.06, 0.44, 0.38, x, 0, 0));
      break;
    }
    case "column": {
      const h = item.h ?? 4;
      // `w`-ով՝ զանգվածեղ քառանիստ մույթ (գմբեթը կրող սյուն), առանց՝ բարակ կլոր սյուն։
      if (item.w && item.w > 0.8) local.add("stone", box(item.w + 0.2, 0.4, item.w + 0.2, 0, 0, 0), box(item.w, h - 0.7, item.w, 0, 0.4, 0), box(item.w + 0.3, 0.3, item.w + 0.3, 0, h - 0.3, 0));
      else local.add("stone", box(0.7, 0.25, 0.7, 0, 0, 0), cylinder(0.25, 0.28, h - 0.5, 16, 0, 0.25, 0), box(0.7, 0.25, 0.7, 0, h - 0.25, 0));
      break;
    }
    case "chalice": {
      // Սկիհ (~26 սմ)՝ գմբեթաձև ոտք, բռնակ՝ գնդով, կակաչաձև բաժակ, բաժակին՝ խաչ։
      local.add("gold", lathe([
        [0, 0], [0.085, 0], [0.086, 0.008], [0.07, 0.022], [0.04, 0.04], [0.022, 0.06], [0.017, 0.08], [0.03, 0.092], [0.034, 0.105],
        [0.03, 0.118], [0.017, 0.13], [0.02, 0.15], [0.045, 0.165], [0.068, 0.19], [0.08, 0.225], [0.084, 0.262], [0.078, 0.262],
        [0.074, 0.228], [0.062, 0.196], [0, 0.178],
      ], seg, 0, 0, 0));
      local.add("gold", box(0.012, 0.05, 0.012, 0, 0.198, 0.074), box(0.034, 0.011, 0.012, 0, 0.226, 0.074));
      if (detail) local.add("gold", clean(new TorusGeometry(0.081, 0.004, 6, 48).rotateX(Math.PI / 2).translate(0, 0.262, 0)));
      break;
    }
    case "gospel": {
      // Ավետարան՝ հաստ գիրք, ոսկե կազմ՝ եզրագծով, մեջտեղում ուռուցիկ խաչ, անկյուններում զարդեր, ճարմանդներ։
      const w = 0.34;
      const d = 0.44;
      local.add("gold", box(w, 0.014, d, 0, 0, 0), box(w, 0.014, d, 0, 0.096, 0));
      local.add("marble", box(w - 0.02, 0.082, d - 0.02, 0.008, 0.014, 0));
      local.add("gold", clean(new CylinderGeometry(0.055, 0.055, d, 12, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2).translate(-w / 2, 0.055, 0)));
      const top = 0.11;
      for (const [bw, bd, x, z] of [[w - 0.04, 0.014, 0, d / 2 - 0.03], [w - 0.04, 0.014, 0, -d / 2 + 0.03], [0.014, d - 0.06, w / 2 - 0.03, 0], [0.014, d - 0.06, -w / 2 + 0.03, 0]] as const) {
        local.add("gold", box(bw, 0.008, bd, x, top, z));
      }
      local.add("gold", box(0.04, 0.016, 0.24, 0, top, 0.01), box(0.17, 0.016, 0.04, 0, top, -0.04));
      for (const [x, z] of [[-0.12, -0.17], [0.12, -0.17], [-0.12, 0.17], [0.12, 0.17]]) local.add("gold", cylinder(0.022, 0.026, 0.012, detail ? 16 : 8, x, top, z));
      local.add("icon", cylinder(0.026, 0.026, 0.018, detail ? 20 : 8, 0, top, -0.04));
      for (const z of [-0.12, 0.12]) local.add("gold", box(0.03, 0.1, 0.035, w / 2 + 0.005, 0.005, z));
      break;
    }
    case "censer": {
      // Բուրվառ՝ գնդաձև աման, գմբեթաձև կափարիչ՝ խաչով, չորս շղթա զանգակներով, կախված կանգնակից։
      local.add("gold", cylinder(0.02, 0.025, 1.75, 8, 0, 0, 0), lathe([[0, 0], [0.16, 0], [0.15, 0.03], [0.04, 0.06], [0, 0.06]], seg, 0, 0, 0));
      local.add("gold", box(0.025, 0.025, 0.36, 0, 1.74, 0.17));
      const hook = new Vector3(0, 1.66, 0.34);
      const bowlY = 0.95;
      local.add("gold", lathe([[0, 0], [0.05, 0], [0.05, 0.015], [0.03, 0.03], [0.08, 0.05], [0.11, 0.09], [0.12, 0.13], [0.115, 0.15], [0, 0.15]], seg, 0, bowlY, 0.34));
      local.add("gold", lathe([[0.118, 0], [0.112, 0.04], [0.09, 0.09], [0.055, 0.13], [0.03, 0.15], [0.03, 0.17], [0, 0.17]], seg, 0, bowlY + 0.15, 0.34));
      if (detail) for (const y of [0.15, 0.2]) local.add("gold", clean(new TorusGeometry(y === 0.15 ? 0.118 : 0.108, 0.005, 6, 48).rotateX(Math.PI / 2).translate(0, bowlY + y, 0.34)));
      local.add("gold", box(0.014, 0.09, 0.014, 0, bowlY + 0.32, 0.34), box(0.05, 0.014, 0.014, 0, bowlY + 0.37, 0.34));
      local.add("gold", clean(new TorusGeometry(0.03, 0.006, 6, 16).translate(0, hook.y, 0.34)));
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
        const rim = new Vector3(0.116 * Math.cos(a), bowlY + 0.14, 0.34 + 0.116 * Math.sin(a));
        local.add("gold", rod(rim, hook, detail ? 0.003 : 0.004, detail ? 6 : 4));
        const bells = detail ? 5 : 2;
        for (let k = 1; k <= bells; k++) {
          const p = new Vector3().lerpVectors(rim, hook, k / (bells + 1));
          local.add("gold", lathe([[0, 0], [0.012, 0], [0.01, 0.01], [0.004, 0.018], [0, 0.02]], detail ? 12 : 6, p.x, p.y - 0.022, p.z));
        }
      }
      break;
    }
    case "fan": {
      // Քշոց՝ ձողի վրա կլոր թիթեղ, վեց թև (սերովբե), մեջտեղում խաչ, եզրին զանգակներ, վերևում խաչ (երկու կողմից)։
      const cy = 2.25;
      const c = new Vector3(0, cy, 0);
      local.add("gold", cylinder(0.018, 0.022, cy - 0.21, 8, 0, 0, 0), lathe([[0, 0], [0.14, 0], [0.12, 0.03], [0.03, 0.08], [0, 0.08]], seg, 0, 0, 0));
      if (detail) for (const y of [0.9, 1.6]) local.add("gold", clean(new SphereGeometry(0.035, 12, 8).translate(0, y, 0)));
      local.add("gold", ...twoSided(circleShape(0.21), c, 0.003));
      local.add("gold", clean(new TorusGeometry(0.21, 0.012, 6, detail ? 64 : 24).translate(0, cy, 0)));
      const wing = new Shape();
      wing.moveTo(-0.026, 0);
      wing.bezierCurveTo(-0.07, 0.05, -0.05, 0.12, 0, 0.16);
      wing.bezierCurveTo(0.03, 0.12, 0.045, 0.05, 0.026, 0);
      wing.lineTo(-0.026, 0);
      for (const deg of [55, 125, 0, 180, -55, -125]) {
        const a = (deg * Math.PI) / 180;
        for (const g of twoSided(wing, new Vector3(0, 0, 0), 0.007)) {
          g.applyMatrix4(new Matrix4().makeRotationZ(a - Math.PI / 2).setPosition(0.04 * Math.cos(a), cy + 0.04 * Math.sin(a), 0));
          local.add("marble", g);
        }
      }
      local.add("gold", ...twoSided(circleShape(0.055), c, 0.011));
      local.add("icon", ...twoSided(crossShape(0.07), c, 0.014));
      local.add("gold", box(0.016, 0.13, 0.016, 0, cy + 0.21, 0), box(0.07, 0.016, 0.016, 0, cy + 0.29, 0));
      const bells = detail ? 16 : 8;
      for (let i = 0; i < bells; i++) {
        const a = (Math.PI * 2 * (i + 0.5)) / bells;
        if (Math.sin(a) > 0.92) continue;
        local.add("gold", lathe([[0, 0], [0.016, 0], [0.013, 0.012], [0.005, 0.022], [0, 0.024]], detail ? 12 : 6, 0.235 * Math.cos(a), cy + 0.235 * Math.sin(a) - 0.024, 0));
      }
      break;
    }
    case "candlestick": {
      // Աշտանակ՝ հիմք, ձող, մոմակալ սկուտեղ, մոմ։
      local.add("gold", lathe([[0, 0], [0.2, 0], [0.18, 0.04], [0.06, 0.12], [0.035, 0.2], [0, 0.2]], seg, 0, 0, 0));
      local.add("gold", cylinder(0.022, 0.03, 1.3, 8, 0, 0.2, 0));
      if (detail) for (const y of [0.55, 0.95, 1.3]) local.add("gold", clean(new SphereGeometry(0.045, 12, 8).translate(0, y, 0)));
      local.add("gold", lathe([[0, 0], [0.11, 0], [0.12, 0.03], [0.1, 0.035], [0, 0.03]], seg, 0, 1.5, 0));
      local.add("marble", cylinder(0.026, 0.026, 0.3, 8, 0, 1.53, 0));
      flame(0, 1.84, 0);
      break;
    }
    case "procession-icon": {
      // Թափորի սրբապատկեր՝ ձող, շրջանակ (երկու կողմից), խաչ վերևում, կանգնակ։
      local.add("gold", lathe([[0, 0], [0.16, 0], [0.14, 0.03], [0.03, 0.1], [0, 0.1]], seg, 0, 0, 0), cylinder(0.02, 0.024, 2.05, 8, 0, 0, 0));
      const base = 2.05;
      local.add("gold", ...twoSided(openingShape("arch", 0.56, 0.74), new Vector3(0, base, 0)));
      local.add("icon", ...twoSided(openingShape("arch", 0.46, 0.64), new Vector3(0, base + 0.05, 0), 0.009));
      local.add("gold", ...twoSided(crossShape(0.18), new Vector3(0, base + 0.36, 0), 0.014));
      local.add("gold", box(0.025, 0.22, 0.025, 0, base + 0.74, 0), box(0.12, 0.025, 0.025, 0, base + 0.88, 0));
      break;
    }
  }
  return local;
}

/** Պարագան տեղադրվում է եկեղեցում (պտույտ + տեղ)։ */
function item(kit: Kit, item: Item) {
  const local = itemParts(item, false);
  const matrix = new Matrix4().makeRotationY(((item.rot ?? 0) * Math.PI) / 180).setPosition(item.at[0], item.y ?? 0, item.at[1]);
  for (const [look, parts] of local.buckets) {
    for (const part of parts) kit.add(look, part.applyMatrix4(matrix));
  }
  for (const p of local.glows.small) kit.glows.small.push(p.applyMatrix4(matrix));
  for (const p of local.glows.large) kit.glows.large.push(p.applyMatrix4(matrix));
}

// ---------- Դուրսը ----------

function gableRoof(kit: Kit, mass: Mass) {
  const roof = mass.roof;
  if (roof.type !== "gable" && roof.type !== "shed") return;
  const box = bounds(polygonOf(mass.outline));
  const { axis, rise } = roof;
  const half = axis === "z" ? (box.maxX - box.minX) / 2 : (box.maxZ - box.minZ) / 2;
  const centerAcross = axis === "z" ? (box.minX + box.maxX) / 2 : (box.minZ + box.maxZ) / 2;
  const from = axis === "z" ? box.minZ : box.minX;
  const to = axis === "z" ? box.maxZ : box.maxX;
  const base = mass.height;
  const map = (along: number, across: number, y: number) => axis === "z" ? new Vector3(centerAcross + across, y, along) : new Vector3(along, y, centerAcross + across);
  const slope = (side: number, width: number) => axis === "z" ? new Vector3(side * rise, width, 0).normalize() : new Vector3(0, width, side * rise).normalize();
  if (roof.type === "shed") {
    // Միաթեք. ցածր կողմից (`low`) դեպի բարձր կողմը, բարձր կողմում՝ պատ մինչև տանիքը։
    const lowSide = roof.low === "-" ? -1 : 1;
    kit.add("roof", surface(1, 1, (u, v) => map(from + (to - from) * u, lowSide * half * (1 - 2 * v), base + rise * v), constant(slope(lowSide, 2 * half))));
    const n = axis === "z" ? new Vector3(-lowSide, 0, 0) : new Vector3(0, 0, -lowSide);
    kit.add("extTuff", quad(map(from, -lowSide * half, 0), map(to, -lowSide * half, 0), base, base + rise, n));
    for (const [along, sign] of [[from, -1], [to, 1]] as const) {
      const end = axis === "z" ? new Vector3(0, 0, sign) : new Vector3(sign, 0, 0);
      const a = map(along, lowSide * half, base);
      const b = map(along, -lowSide * half, base);
      const c = map(along, -lowSide * half, base + rise);
      kit.add("extTuff", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).lerp(c, v * u), constant(end)));
    }
    return;
  }
  for (const side of [1, -1]) {
    kit.add("roof", surface(1, 1, (u, v) => map(from + (to - from) * u, side * half * (1 - v), base + rise * v), constant(slope(side, half))));
  }
  for (const [along, sign] of [[from, -1], [to, 1]] as const) {
    const n = axis === "z" ? new Vector3(0, 0, sign) : new Vector3(sign, 0, 0);
    const triangle = new Shape([new Vector2(-half, 0), new Vector2(half, 0), new Vector2(0, rise)]);
    kit.add("extTuff", place(clean(new ShapeGeometry(triangle)), map(along, 0, base), n));
  }
}

/** Բազալտե ցոկոլ՝ պատից մի քիչ դուրս ցցված, դռների տեղում՝ ընդհատված։ */
function plinth(kit: Kit, mass: Mass, height: number, doors: ReadonlyArray<{ p: Pt; w: number }>) {
  const inner = polygonOf(mass.outline);
  const outer = offsetPolygon(inner, 0.12);
  outer.forEach((p, i) => {
    const q = outer[(i + 1) % outer.length];
    const a = v3(p, 0);
    const b = v3(q, 0);
    const dir = new Vector3().subVectors(b, a);
    const total = dir.length();
    if (total < 1e-6) return;
    dir.normalize();
    const n = new Vector3(dir.z, 0, -dir.x);
    const mid = new Vector3().lerpVectors(a, b, 0.5);
    if (n.dot(new Vector3(inner[i][0], 0, inner[i][1]).sub(mid)) > 0) n.negate();
    const gaps = doors
      .map((door) => ({ s: new Vector3(door.p[0], 0, door.p[1]).sub(a).dot(dir), off: Math.abs(new Vector3(door.p[0], 0, door.p[1]).sub(a).dot(n)), w: door.w }))
      .filter((door) => door.off < 0.4 && door.s > -door.w && door.s < total + door.w)
      .map((door) => [door.s - door.w / 2 - 0.1, door.s + door.w / 2 + 0.1] as const)
      .sort((x, y) => x[0] - y[0]);
    let cursor = 0;
    const at = (t: number) => a.clone().addScaledVector(dir, t);
    const piece = (t0: number, t1: number) => {
      if (t1 - t0 < 0.02) return;
      kit.add("basalt", quad(at(t0), at(t1), 0, height, n));
      const top = n.clone().multiplyScalar(-0.13);
      kit.add("basalt", surface(1, 1, (u, v) => new Vector3().lerpVectors(at(t0), at(t1), u).addScaledVector(top, v).setY(height), constant(UP)));
    };
    for (const [g0, g1] of gaps) { piece(cursor, Math.max(cursor, Math.min(total, g0))); cursor = Math.max(cursor, Math.min(total, g1)); }
    piece(cursor, total);
  });
}

function massShell(kit: Kit, mass: Mass) {
  const base = mass.base ?? 0;
  const polygon = polygonOf(mass.outline);
  if (mass.height > base) {
    for (const edge of edgesOf(mass.outline)) {
      for (let i = 0; i < edge.pts.length - 1; i++) {
        kit.add("extTuff", quad(v3(edge.pts[i], 0), v3(edge.pts[i + 1], 0), base, mass.height, h3(edge.inward[i]).negate()));
      }
    }
  }
  if (mass.arches) {
    // Բաց կամարներ (զանգակատան սրահ)՝ ամեն ուղիղ պատի մեջտեղում։
    for (const edge of edgesOf(mass.outline)) {
      if (edge.bulge) continue;
      const mid = v3([(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2], base);
      const out = h3(edge.inward[0]).negate();
      kit.add("extDark", panel("arch", mass.arches.w, mass.arches.h, mid.addScaledVector(out, 0.02), out));
    }
  }
  const roof = mass.roof;
  if (roof.type === "flat") kit.add("roof", flatShape(polygon, mass.height, "up"));
  if (roof.type === "gable" || roof.type === "shed") gableRoof(kit, mass);
  if (roof.type === "tent") {
    const rise = roof.rise;
    const c = roof.apex ?? polygon.reduce((s, p) => [s[0] + p[0] / polygon.length, s[1] + p[1] / polygon.length], [0, 0]);
    const apex = new Vector3(c[0], mass.height + rise, c[1]);
    polygon.forEach((p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      const a = v3(p, mass.height);
      const b = v3(q, mass.height);
      const face = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(apex, a));
      if (face.lengthSq() < 1e-8) return;
      face.normalize();
      if (face.y < 0) face.negate();
      kit.add("roof", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).lerp(apex, v), constant(face)));
    });
  }
}

/** Թմբուկի կույր կամարներ. ամեն նիստին երկու կիսասյունիկ և կամար (ռելիեֆ, որ լույսից երևա)։ */
function drumArcade(kit: Kit, dome: Dome, c: Vector3, apothem: number, R: number, top: number) {
  const facet = 2 * R * Math.sin(Math.PI / dome.sides);
  const hw = facet * 0.4;
  const y0 = dome.base - 0.2;
  const spring = top - hw - 0.35;
  if (spring <= y0 + 0.5) return;
  for (let i = 0; i < dome.sides; i++) {
    const t = (Math.PI * 2 * (i + 0.5)) / dome.sides;
    const d = new Vector3(Math.sin(t), 0, Math.cos(t));
    const across = new Vector3(d.z, 0, -d.x);
    const face = c.clone().addScaledVector(d, apothem + 0.06);
    for (const sign of [-1, 1]) {
      const p = face.clone().addScaledVector(across, sign * hw);
      kit.add("extTuff", cylinder(0.09, 0.09, spring - y0, 6, p.x, y0, p.z));
    }
    const arch = new TorusGeometry(hw, 0.09, 4, 10, Math.PI);
    kit.add("extTuff", place(clean(arch), face.clone().setY(spring), d));
  }
}

/** Զարդ պատուհանի վրա. ճակտոն (եռանկյուն փոքր տանիքով) կամ կամարաձև շրջանակ։ */
function windowFrame(kit: Kit, frame: "pediment" | "hood", w: number, top: Vector3, out: Vector3) {
  const across = new Vector3(out.z, 0, -out.x);
  if (frame === "hood") {
    kit.add("extTuff", place(clean(new TorusGeometry(w / 2 + 0.12, 0.07, 4, 10, Math.PI)), top.clone().addScaledVector(out, 0.05).setY(top.y - w / 2), out));
    return;
  }
  const half = w / 2 + 0.4;
  const rise = Math.min(0.7, half * 0.6);
  const y = top.y + 0.15;
  const front = top.clone().addScaledVector(out, 0.14).setY(y);
  const back = top.clone().addScaledVector(out, 0.01).setY(y);
  const tri = new Shape([new Vector2(-half, 0), new Vector2(half, 0), new Vector2(0, rise)]);
  kit.add("extTuff", place(clean(new ShapeGeometry(tri)), front, out));
  for (const sign of [-1, 1]) {
    const a = front.clone().addScaledVector(across, sign * half);
    const b = front.clone().setY(y + rise);
    const n = new Vector3(0, half, 0).addScaledVector(across, sign * rise).normalize();
    kit.add("extTuff", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).addScaledVector(out, -0.13 * v), constant(n)));
  }
  kit.add("extTuff", surface(1, 1, (u, v) => front.clone().addScaledVector(across, half * (2 * u - 1)).lerp(back.clone().addScaledVector(across, half * (2 * u - 1)), v), constant(UP.clone().negate())));
}

/** Քիվ՝ ծավալի պատերի վերևում դուրս ցցված գոտի։ */
function cornice(kit: Kit, mass: Mass) {
  const inner = polygonOf(mass.outline);
  const outer = offsetPolygon(inner, 0.16);
  const h = 0.32;
  const top = mass.height;
  outer.forEach((p, i) => {
    const q = outer[(i + 1) % outer.length];
    const a = v3(p, 0);
    const b = v3(q, 0);
    const dir = new Vector3().subVectors(b, a);
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    const n = new Vector3(dir.z, 0, -dir.x);
    if (n.dot(new Vector3(inner[i][0], 0, inner[i][1]).sub(a)) > 0) n.negate();
    kit.add("extTuff", quad(a, b, top - h, top, n));
    const ia = v3(inner[i], top - h);
    const ib = v3(inner[(i + 1) % inner.length], top - h);
    kit.add("extTuff", surface(1, 1, (u, v) => new Vector3().lerpVectors(a.clone().setY(top - h), b.clone().setY(top - h), u).lerp(new Vector3().lerpVectors(ia, ib, u), v), constant(UP.clone().negate())));
  });
}

/** Քառասյուն հիմք՝ ամեն կողմից կամարով բաց (Էջմիածնի ռոտոնդաների տակ)։ */
function pavilion(kit: Kit, x: number, z: number, side: number, y: number, height: number) {
  const pier = Math.max(0.35, side * 0.16);
  const half = side / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add("extTuff", box(pier, height, pier, x + sx * (half - pier / 2), y, z + sz * (half - pier / 2)));
  const span = side - 2 * pier;
  const spring = y + Math.max(0.4, height - span / 2 - 0.35);
  const sides: Array<[Vector3, Vector3]> = [[new Vector3(0, 0, 1), new Vector3(1, 0, 0)], [new Vector3(0, 0, -1), new Vector3(1, 0, 0)], [new Vector3(1, 0, 0), new Vector3(0, 0, 1)], [new Vector3(-1, 0, 0), new Vector3(0, 0, 1)]];
  for (const [n, across] of sides) {
    const center = new Vector3(x, spring, z).addScaledVector(n, half);
    kit.add("extTuff", ...spandrels(center, across, span / 2, span / 2, y + height - spring, n));
    // Կամարի ներքևի կորը (հաստությամբ)։
    const c = new Vector3(x, spring, z).addScaledVector(n, half - pier / 2);
    kit.add("extTuff", surface(1, 10, (u, v) => {
      const t = Math.PI * v;
      return c.clone().addScaledVector(n, (u - 0.5) * pier).addScaledVector(across, (span / 2) * Math.cos(t)).addScaledVector(UP, (span / 2) * Math.sin(t));
    }, (p) => c.clone().addScaledVector(n, new Vector3().subVectors(p, c).dot(n)).sub(p).normalize()));
  }
  kit.add("extTuff", flatShape([[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]], y + height - 0.01, "down"));
}

function domeOutside(kit: Kit, dome: Dome) {
  const c = v3(dome.at, 0);
  const apothem = dome.radius + 0.4;
  const R = apothem / Math.cos(Math.PI / dome.sides);
  // Թմբուկը սկսվում է տանիքի մեջից, որ գմբեթը երբեք օդում չկախվի։
  const y0 = Math.min(dome.drumFrom ?? dome.base - 0.4, dome.base - 0.4);
  const y1 = dome.base + dome.drum + dome.radius * 0.33;
  // Նիստերի անկյունները՝ 0-ից, որ պատուհանները (drumDirections) ընկնեն նիստերի մեջտեղը։
  const turn = 0;
  kit.add("extTuff", clean(new CylinderGeometry(R, R, y1 - y0, dome.sides, 1, false, turn).translate(c.x, (y0 + y1) / 2, c.z), true));
  const coneH = dome.radius * (dome.capHeight ?? 0.95);
  if (dome.arcade) drumArcade(kit, dome, c, apothem, R, y1);
  const rim = R + 0.5;
  if (dome.cap === "umbrella") {
    // Հովանոցաձև. ամեն նիստի վրա փոքր ճակտոն, տանիքը՝ ծալքերով։
    const lift = Math.min(0.9, (2 * Math.PI * R) / dome.sides / 2.6);
    const apex = new Vector3(c.x, y1 + coneH + lift * 0.5, c.z);
    const corner = (i: number, radius: number, y: number) => {
      const a = turn + (Math.PI * 2 * i) / dome.sides;
      return new Vector3(c.x + radius * Math.sin(a), y, c.z + radius * Math.cos(a));
    };
    const mid = (i: number, radius: number, y: number) => corner(i + 0.5, radius * Math.cos(Math.PI / dome.sides), y);
    for (let i = 0; i < dome.sides; i++) {
      const a = corner(i, R, y1);
      const b = corner(i + 1, R, y1);
      const m = mid(i, R, y1 + lift);
      const n = new Vector3().subVectors(m, c.clone().setY(m.y)).normalize();
      kit.add("extTuff", surface(1, 1, (u, v) => new Vector3().lerpVectors(a, b, u).lerp(m, v * (1 - Math.abs(u - 0.5) * 2)), constant(n)));
      for (const [p, q] of [[corner(i, rim, y1), mid(i, rim, y1 + lift)], [mid(i, rim, y1 + lift), corner(i + 1, rim, y1)]]) {
        const face = new Vector3().subVectors(q, p).cross(new Vector3().subVectors(apex, p)).normalize();
        if (face.y < 0) face.negate();
        kit.add("capRoof", surface(1, 1, (u, v) => new Vector3().lerpVectors(p, q, u).lerp(apex, v), constant(face)));
      }
    }
  } else if (dome.cap !== "none") {
    kit.add("capRoof", clean(new ConeGeometry(rim, coneH, dome.sides, 1, true, turn).translate(c.x, y1 + coneH / 2, c.z), true));
  }
  kit.add("capRoof", clean(new ShapeGeometry(circleShape(rim), 6).rotateX(Math.PI / 2).translate(c.x, y1, c.z)));
  const cy = dome.cap === "none" ? y1 : y1 + coneH + (dome.cap === "umbrella" ? 0.3 : 0);
  if (dome.cross !== false) kit.add("gold", box(0.14, 1.5, 0.14, c.x, cy - 0.1, c.z), box(0.8, 0.14, 0.14, c.x, cy + 0.8, c.z));
  const w = dome.windows;
  if (w) {
    for (const d of drumDirections(dome)) {
      kit.add("extDark", panel(w.shape ?? "arch", w.w, w.h, c.clone().addScaledVector(d, apothem + 0.02).setY(dome.base + 0.9), d));
    }
  }
}

function belfry(kit: Kit, belfry: Belfry) {
  const [x, z] = belfry.at;
  const { base, columns } = belfry;
  const side = belfry.radius * 2.6;
  let y = base;
  if (belfry.pavilion) {
    // Քառասյուն հիմք՝ չորս կողմից բաց կամարներով։
    pavilion(kit, x, z, side, y, belfry.pavilion);
    y += belfry.pavilion;
  }
  kit.add("extTuff", box(side, 0.8, side, x, y, z));
  y += 0.8;
  let r = belfry.radius;
  const tiers = Math.max(1, Math.round(belfry.tiers ?? 1));
  for (let t = 0; t < tiers; t++) {
    const height = belfry.height * (t ? 0.8 : 1);
    for (let i = 0; i < columns; i++) {
      const a = (Math.PI * 2 * i) / columns;
      kit.add("extTuff", cylinder(0.14, 0.16, height, 8, x + r * Math.cos(a), y, z + r * Math.sin(a)));
    }
    // Զանգը՝ առաջին հարկում։
    if (t === 0) {
      const top = y + height;
      kit.add("gold", lathe([[0.02, 0], [r * 0.35, 0], [r * 0.32, 0.08], [r * 0.2, 0.5], [r * 0.15, 0.75], [0.08, 0.82], [0, 0.82]], 16, x, top - 1.4, z));
      kit.add("gold", cylinder(0.02, 0.02, 0.6, 4, x, top - 0.6, z));
    }
    y += height;
    kit.add("extTuff", cylinder(r + 0.35, r + 0.35, 0.3, 12, x, y, z, true));
    y += 0.3;
    if (t < tiers - 1) r *= 0.82;
  }
  kit.add("capRoof", clean(new ConeGeometry(r + 0.45, 1.5, 12).translate(x, y + 0.75, z), true));
  if (belfry.cross !== false) kit.add("gold", box(0.08, 0.8, 0.08, x, y + 1.5, z), box(0.4, 0.08, 0.08, x, y + 1.95, z));
}

/** Պատուհաններն ու դռները՝ դրսի պատին (ներսի դիրքից դեպի դուրս ամենամոտ պատը)։ */
function openingsOutside(kit: Kit, model: ChurchModel) {
  const doorsOut: Array<{ p: Pt; w: number }> = [];
  for (const room of model.rooms) {
    const edges = edgesOf(room.outline);
    for (const window of room.windows ?? []) {
      for (const s of openingCenters(window)) {
        const { p, n } = pointOnEdge(edges[window.edge], s);
        const out: Pt = [-n[0], -n[1]];
        const hit = exteriorHit(model, p, out, window.y, window.h);
        if (!hit) continue;
        kit.add("extDark", panel(window.shape ?? "arch", window.w, window.h, v3(hit.p, window.y).addScaledVector(h3(out), 0.02), h3(out)));
        if (window.frame) windowFrame(kit, window.frame, window.w, v3(hit.p, window.y + window.h), h3(out));
      }
    }
    for (const door of room.doors ?? []) {
      const { p, n } = pointOnEdge(edges[door.edge], door.at);
      const out: Pt = [-n[0], -n[1]];
      const hit = exteriorHit(model, p, out, 0, door.h);
      if (!hit) continue;
      doorsOut.push({ p: hit.p, w: door.w });
      kit.add("extDark", panel("arch", door.w, door.h, v3(hit.p, 0).addScaledVector(h3(out), 0.02), h3(out)));
      const cross = v3(hit.p, door.h + 0.35).addScaledVector(h3(out), 0.03);
      kit.add("gold", place(clean(new ShapeGeometry(openingShape("cross", 0.36, 0.6))), cross, h3(out)));
    }
  }
  return doorsOut;
}

// ---------- Ամբողջը ----------

export function buildChurch(model: ChurchModel, materials: Map<LookName, Material>, options: { separateItems?: boolean } = {}) {
  const inside = new Kit();
  for (const room of model.rooms) roomShell(inside, room);
  for (const v of model.vaults) vault(inside, v);
  for (const a of model.arcades) arcade(inside, a);
  for (const d of domesOf(model)) domeInside(inside, d);
  if (model.bema) bema(inside, model.bema);
  for (const b of model.balconies) balcony(inside, model, b);
  // Խմբագրիչում ամեն պարագա առանձին խումբ է, որ 3D-ում մկնիկով/մատով տեղափոխվի։
  const itemGroups: Group[] = [];
  if (options.separateItems) {
    model.items.forEach((it, index) => {
      const local = itemParts(it, false);
      const group = local.build(materials, model.tuff, 20);
      group.position.set(it.at[0], it.y ?? 0, it.at[1]);
      group.rotation.y = ((it.rot ?? 0) * Math.PI) / 180;
      group.userData.item = index;
      group.updateMatrixWorld(true);
      for (const p of [...local.glows.small]) inside.glows.small.push(p.applyMatrix4(group.matrixWorld));
      for (const p of [...local.glows.large]) inside.glows.large.push(p.applyMatrix4(group.matrixWorld));
      itemGroups.push(group);
    });
  } else {
    for (const i of model.items) item(inside, i);
  }

  const outside = new Kit();
  for (const m of model.masses) massShell(outside, m);
  for (const d of domesOf(model)) domeOutside(outside, d);
  for (const b of belfriesOf(model)) belfry(outside, b);
  const doorsOut = openingsOutside(outside, model);
  const plinthHeight = model.look?.plinth ?? 0;
  if (plinthHeight > 0) for (const m of model.masses) if (!(m.base ?? 0)) plinth(outside, m, plinthHeight, doorsOut);
  if (model.look?.cornice) for (const m of model.masses) if (m.height > (m.base ?? 0) + 0.5) cornice(outside, m);

  const domes = domesOf(model);
  const top = domes.length ? Math.max(...domes.map((d) => d.base + d.drum + d.radius)) : Math.max(...model.vaults.map((v) => v.spring + (v.rise ?? v.width / 2)), ...model.rooms.map((r) => r.height));
  const interior = inside.build(materials, model.tuff, top);
  const exterior = outside.build(materials, model.tuff, top + 2);

  let curtainOpen: Mesh | null = null;
  let curtainClosed: Group | null = null;
  if (model.bema) {
    const c = curtains(model.bema);
    curtainOpen = new Mesh(c.open, materials.get("fabric"));
    curtainClosed = new Group();
    curtainClosed.add(new Mesh(c.closed, materials.get("fabric")), new Mesh(c.cross, materials.get("gold")));
    curtainClosed.visible = false;
    interior.add(curtainOpen, curtainClosed);
  }
  for (const group of itemGroups) interior.add(group);
  return { interior, exterior, curtainOpen, curtainClosed, glows: inside.glows, itemGroups };
}
