// Եկեղեցական սպասքի 3D դիտիչ։ Մոդելները կառուցվում են իրական լուսանկարից.
// կլոր իրերը՝ պտտման մարմին (պրոֆիլը՝ նկարի եզրագծից, մակերեսը՝ հենց լուսանկարը),
// քշոցը՝ ռելիեֆով սկավառակ (խորության քարտեզից), խաչվառները՝ ծածանվող կտոր։
import {
  ACESFilmicToneMapping, AmbientLight, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Clock, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, FrontSide, Group, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Scene, SphereGeometry, SRGBColorSpace, TextureLoader,
  TorusGeometry, Vector3, WebGLRenderer, type Material, type Texture,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import ASSETS from "./assets.json";
import type { VesselId } from "./items";

type Rows = number[][];
type Lathe = { tex: string; w: number; h: number; axis: number; parts: Rows[]; flats: number[][] };
type Kshots = { tex: string; relief: string; w: number; h: number; axis: number; diskBottom: number; parts: Rows[] };
type Banner = { tex: string; w: number; h: number; rod: number; pole: number };

export type VesselViewer = { dispose: () => void; setAutoRotate: (on: boolean) => void; reset: () => void; toggleLid?: () => boolean };

/** Առջևի այն անկյունը, որտեղ նկարը ճշգրիտ է (ռադիան)։ */
const FRONT = (68 * Math.PI) / 180;

/** Ամբողջ իրի բարձրությունը 3D-ում (միավոր)։ */
const HEIGHT = 2;

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Պտտման մարմին նկարի պրոֆիլից։ Ամեն կետի գույնը վերցվում է լուսանկարի համապատասխան տեղից, հետևը՝ առջևի հայելին։ */
function latheGeometry(rows: Rows, axis: number, w: number, h: number, scale: number, base: number, segments = 120) {
  // Կափարիչներ՝ վերևում և ներքևում (շառավիղ 0)։
  const first = rows[0], last = rows[rows.length - 1];
  const pts = [[first[0], 0, first[2]], ...rows, [last[0], 0, last[2]]];
  const ring = segments + 1;
  const pos = new Float32Array(pts.length * ring * 3);
  const uv = new Float32Array(pts.length * ring * 2);
  pts.forEach(([y, r, cx = axis], i) => {
    for (let j = 0; j < ring; j++) {
      // Կարը (seam)՝ հետևում, որ առջևում նորմալները հարթ լինեն։
      const t = Math.PI + (j / segments) * Math.PI * 2;
      const s = Math.sin(t);
      // Նկարի կողքերը (եզրի մոտ) ուժեղ ձգվում են. առջևի ±FRONT°-ը՝ ճշգրիտ, մնացածը՝ նույն հատվածի հայելին։
      let a = Math.atan2(s, Math.cos(t));
      const sign = Math.sign(a) || 1; a = Math.abs(a);
      const phi = a <= FRONT ? a : FRONT * (Math.PI - a) / (Math.PI - FRONT);
      const k = (i * ring + j) * 3;
      pos[k] = r * s * scale;
      pos[k + 1] = (base - y) * scale;
      pos[k + 2] = r * Math.cos(t) * scale;
      const q = (i * ring + j) * 2;
      // 0.94՝ եզրի մոտ ֆոնի պիքսելներ չվերցնելու համար։
      uv[q] = (cx + r * 0.96 * Math.sin(phi) * sign) / w;
      uv[q + 1] = 1 - y / h;
    }
  });
  const index: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Հարթ կտրվածք նկարից (օր.՝ բուրվառի գագաթի խաչը)։ */
function flatPiece(texture: Texture, rect: number[], w: number, h: number, scale: number, base: number, axis: number, material: Material) {
  const [x0, y0, x1, y1] = rect;
  const geometry = new PlaneGeometry((x1 - x0) * scale, (y1 - y0) * scale);
  const uv = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / w, 1 - (y1 - uv.getY(i) * (y1 - y0)) / h);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(((x0 + x1) / 2 - axis) * scale, (base - (y0 + y1) / 2) * scale, 0);
  void texture;
  return mesh;
}

/** Շղթա A-ից B՝ օղակներով (InstancedMesh)։ */
function chain(from: Vector3, to: Vector3, link: number, material: Material) {
  const length = from.distanceTo(to);
  const count = Math.max(2, Math.round(length / (link * 0.78)));
  const geometry = new TorusGeometry(link * 0.42, link * 0.1, 6, 12);
  geometry.scale(0.75, 1.25, 1);
  const mesh = new InstancedMesh(geometry, material, count);
  const dir = to.clone().sub(from).normalize();
  const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  const twist = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const m = new Matrix4();
  for (let i = 0; i < count; i++) {
    const p = from.clone().lerp(to, (i + 0.5) / count);
    const q = align.clone();
    if (i % 2) q.multiply(twist);
    m.compose(p, q, new Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

function metal(tone: "silver" | "gold" | "dark") {
  const color = { silver: 0xd9d6cf, gold: 0xd8b56a, dark: 0x8d877c }[tone];
  return new MeshStandardMaterial({ color, metalness: 1, roughness: tone === "dark" ? 0.45 : 0.28, envMapIntensity: 1.1 });
}

/** Լուսանկարի ալֆան՝ առանձին մոխրագույն տեքստուրա (alphaMap-ը կարդում է կանաչ ալիքը)։ */
function alphaTexture(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) { const a = data.data[i + 3]; data.data[i] = a; data.data[i + 1] = a; data.data[i + 2] = a; data.data[i + 3] = 255; }
  ctx.putImageData(data, 0, 0);
  return new CanvasTexture(canvas);
}

/** Փափուկ ստվեր իրի տակ։ */
function contactShadow(radius: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(0.55, "rgba(0,0,0,0.18)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const mesh = new Mesh(new PlaneGeometry(radius * 2, radius * 2), new MeshStandardMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

export function createVesselViewer(host: HTMLElement, id: VesselId, onReady?: () => void): VesselViewer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "vessel-canvas";
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xfff1dc, 1.6);
  key.position.set(2.5, 4, 3.5);
  scene.add(key);
  const rim = new DirectionalLight(0xc9d8ff, 0.7);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);

  const camera = new PerspectiveCamera(32, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  controls.rotateSpeed = 0.7;

  const root = new Group();
  scene.add(root);
  const loader = new TextureLoader();
  const disposables: { dispose: () => void }[] = [pmrem, envTexture];
  const tick: ((t: number, dt: number) => void)[] = [];
  let lidToggle: (() => boolean) | undefined;
  let target = new Vector3(0, HEIGHT / 2, 0);
  let distance = 6.4;

  const photoMaterial = (map: Texture, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) => {
    const material = new MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.4, metalness: 0.42, roughness: 0.42, envMapIntensity: 0.75, ...extra });
    disposables.push(material);
    return material;
  };
  const loadTexture = (url: string) => new Promise<Texture>((resolve, reject) => loader.load(url, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    disposables.push(texture);
    resolve(texture);
  }, undefined, reject));

  async function buildLathe(data: Lathe, tone: "silver" | "gold") {
    const texture = await loadTexture(data.tex);
    const allRows = data.parts.flat();
    const bottom = Math.max(...allRows.map((row) => row[0]));
    const top = Math.min(...allRows.map((row) => row[0]), ...data.flats.map((f) => f[1]));
    const scale = HEIGHT / (bottom - top);
    const material = photoMaterial(texture, { side: DoubleSide });
    const meshes = data.parts.map((rows) => {
      const mesh = new Mesh(latheGeometry(rows, data.axis, data.w, data.h, scale, bottom), material);
      disposables.push(mesh.geometry);
      root.add(mesh);
      return mesh;
    });
    const flatMaterial = photoMaterial(texture, { side: DoubleSide, alphaTest: 0.5, bumpScale: 0.6 });
    const flats = data.flats.map((rect) => {
      const mesh = flatPiece(texture, rect, data.w, data.h, scale, bottom, data.axis, flatMaterial);
      disposables.push(mesh.geometry);
      root.add(mesh);
      return mesh;
    });
    const maxR = Math.max(...allRows.map((row) => row[1])) * scale;
    root.add(contactShadow(maxR * 1.5));
    void tone;
    return { scale, bottom, top, meshes, flats, maxR };
  }

  /** Բուրվառի շղթաներ, վերևի օղակ և զանգակներ։ */
  function censerChains(scale: number, bottom: number, attachY: number, attachR: number, lidY: number, lidR: number, height: number, tone: "silver" | "gold", lid?: Object3D[]) {
    const chainMaterial = metal(tone === "gold" ? "dark" : "silver");
    const bellMaterial = metal(tone === "gold" ? "gold" : "silver");
    disposables.push(chainMaterial, bellMaterial);
    const topY = height;
    const top = new Vector3(0, topY, 0);
    const link = 0.075;
    const angles = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
    const group = new Group();
    for (const a of angles) {
      const low = new Vector3(Math.sin(a) * attachR, (bottom - attachY) * scale, Math.cos(a) * attachR);
      const through = new Vector3(Math.sin(a) * (lidR + 0.02), (bottom - lidY) * scale, Math.cos(a) * (lidR + 0.02));
      const lower = chain(low, through, link, chainMaterial);
      const upper = chain(through, top.clone().add(new Vector3(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05)), link, chainMaterial);
      group.add(lower, upper);
      disposables.push(lower.geometry, upper.geometry);
    }
    // Զանգակներ՝ շղթաների վրա, վերևի երրորդում։
    const bellGeometry = new SphereGeometry(0.075, 24, 16);
    disposables.push(bellGeometry);
    [0.62, 0.7, 0.66, 0.74].forEach((t, i) => {
      const a = angles[i % 3] + (i === 3 ? 0.5 : 0);
      const from = new Vector3(Math.sin(a) * (lidR + 0.02), (bottom - lidY) * scale, Math.cos(a) * (lidR + 0.02));
      const p = from.lerp(top, t);
      const bell = new Mesh(bellGeometry, bellMaterial);
      bell.position.copy(p).add(new Vector3(Math.sin(a) * 0.08, -0.06, Math.cos(a) * 0.08));
      group.add(bell);
    });
    // Վերևի օղակը (ձեռքի համար)։
    const ringGeometry = new TorusGeometry(0.1, 0.018, 10, 32);
    disposables.push(ringGeometry);
    const ring = new Mesh(ringGeometry, chainMaterial);
    ring.position.set(0, topY + 0.09, 0);
    group.add(ring);
    root.add(group);
    void lid;
    return group;
  }

  async function build() {
    if (id === "ashtanak" || id === "khnkaman") {
      const { maxR } = await buildLathe(ASSETS[id] as Lathe, "silver");
      target = new Vector3(0, HEIGHT / 2, 0);
      distance = fit(HEIGHT, maxR * 2);
    } else if (id === "burvar") {
      const data = ASSETS.burvar as Lathe;
      const { scale, bottom, meshes, flats } = await buildLathe(data, "silver");
      const [lidRows, bowlRows] = data.parts;
      const lidBottom = Math.max(...lidRows.map((r) => r[0]));
      const lidR = Math.max(...lidRows.map((r) => r[1])) * scale;
      const bowlTop = Math.min(...bowlRows.map((r) => r[0]));
      const bowlR = bowlRows.slice(0, 12).reduce((m, r) => Math.max(m, r[1]), 0) * scale;
      const chains = censerChains(scale, bottom, bowlTop + 20, bowlR * 0.98, lidBottom - 30, lidR * 0.92, HEIGHT * 1.55, "silver");
      // Կափարիչը իջնում/բարձրանում է (նկարում՝ բաց)։
      const lid = [meshes[0], ...flats];
      const closedDrop = (bowlTop - lidBottom + 6) * scale;
      let open = true, progress = 1;
      lidToggle = () => { open = !open; return open; };
      tick.push((_t, dt) => {
        const goal = open ? 1 : 0;
        progress += Math.sign(goal - progress) * Math.min(Math.abs(goal - progress), dt * 1.2);
        const ease = progress * progress * (3 - 2 * progress);
        for (const mesh of lid) mesh.position.y = (mesh.userData.baseY ??= mesh.position.y) - (1 - ease) * closedDrop;
      });
      target = new Vector3(0, HEIGHT * 0.8, 0);
      distance = fit(HEIGHT * 1.7, 1.2);
      void chains;
    } else if (id === "burvar-gold") {
      const data = ASSETS["burvar-gold"] as Lathe;
      const { scale, bottom } = await buildLathe(data, "gold");
      const rows = data.parts[0];
      // Շղթաները ամրացված են կափարիչի եզրին (ամենալայն տեղը՝ մեջտեղում)։
      const mid = rows.filter((r) => r[0] > rows[0][0] + (rows[rows.length - 1][0] - rows[0][0]) * 0.45 && r[0] < rows[0][0] + (rows[rows.length - 1][0] - rows[0][0]) * 0.6);
      const widest = mid.reduce((m, r) => (r[1] > m[1] ? r : m), mid[0]);
      censerChains(scale, bottom, widest[0], widest[1] * scale * 1.02, widest[0], widest[1] * scale, HEIGHT * 1.6, "gold");
      target = new Vector3(0, HEIGHT * 0.82, 0);
      distance = fit(HEIGHT * 1.75, 1.2);
    } else if (id === "kshots") {
      await buildKshots();
    } else {
      await buildBanner(ASSETS[id] as Banner);
    }
    const dir = new Vector3(0, 0.12, 1).normalize();
    camera.position.copy(target).addScaledVector(dir, distance);
    controls.target.copy(target);
    controls.minDistance = distance * 0.45;
    controls.maxDistance = distance * 1.5;
    controls.saveState();
    resize();
    onReady?.();
  }

  async function buildKshots() {
    const data = ASSETS.kshots as Kshots;
    const [texture, relief] = await Promise.all([loadTexture(data.tex), loadTexture(data.relief)]);
    relief.colorSpace = "";
    const scale = HEIGHT / data.h;
    const width = data.w * scale, height = data.h * scale;
    const material = new MeshPhysicalMaterial({
      map: texture, alphaTest: 0.45, displacementMap: relief, displacementScale: 0.09, bumpMap: texture, bumpScale: 1.6,
      metalness: 0.5, roughness: 0.38, envMapIntensity: 0.9, side: FrontSide,
    });
    disposables.push(material);
    const diskH = data.diskBottom * scale;
    const geometry = new PlaneGeometry(width, diskH, 220, Math.round((220 * data.diskBottom) / data.w));
    const guv = geometry.attributes.uv as BufferAttribute;
    for (let i = 0; i < guv.count; i++) guv.setY(i, 1 - (1 - guv.getY(i)) * (data.diskBottom / data.h));
    disposables.push(geometry);
    const front = new Mesh(geometry, material);
    // Հետևի կողմը՝ նույն սկավառակը շրջված (հետևից նույնն է երևում, ինչ առջևից)։
    const back = new Mesh(geometry, material);
    back.rotation.y = Math.PI;
    front.position.set((data.w / 2 - data.axis) * scale, height - diskH / 2, 0);
    back.position.set(-front.position.x, height - diskH / 2, 0);
    root.add(front, back);
    // Ձողը՝ պտտման մարմին, ներքևում շարունակվում է։
    const stem = new Mesh(latheGeometry(data.parts[0], data.axis, data.w, data.h, scale, data.h), photoMaterial(texture));
    disposables.push(stem.geometry);
    root.add(stem);
    const last = data.parts[0][data.parts[0].length - 1];
    const poleMaterial = metal("dark");
    disposables.push(poleMaterial);
    const poleGeometry = new CylinderGeometry(last[1] * scale, last[1] * scale * 1.08, 1.2, 40);
    disposables.push(poleGeometry);
    const pole = new Mesh(poleGeometry, poleMaterial);
    pole.position.y = -0.6;
    root.add(pole);
    target = new Vector3(0, HEIGHT * 0.55, 0);
    distance = fit(HEIGHT * 1.15, width);
    // Զանգուլակների թեթև դող՝ քշոցի ամբողջ սկավառակը փոքր-ինչ ճոճվում է։
    let lastAz = controls.getAzimuthalAngle(), swing = 0, vel = 0;
    tick.push((_t, dt) => {
      const az = controls.getAzimuthalAngle();
      vel += (az - lastAz) * 2.5; lastAz = az;
      vel += -swing * 30 * dt; vel *= Math.exp(-3 * dt); swing += vel * dt * 4;
      front.rotation.z = back.rotation.z = swing * 0.05;
    });
  }

  async function buildBanner(data: Banner) {
    const texture = await loadTexture(data.tex);
    const image = texture.image as HTMLImageElement;
    const alpha = alphaTexture(image);
    alpha.minFilter = LinearFilter;
    disposables.push(alpha);
    const scale = (HEIGHT * 1.2) / data.h;
    const clothH = (data.h - data.rod) * scale, width = data.w * scale;
    const offsetX = (data.w / 2 - data.pole) * scale;
    const topY = (data.h - data.rod) * scale; // կտորի վերին եզրը
    // Կտոր՝ ծածանվող (ամեն կադրում վերահաշվարկվող գագաթներ)։
    const cols = 40, rowsN = 64;
    const geometry = new PlaneGeometry(width, clothH, cols, rowsN);
    const uv = geometry.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * ((data.h - data.rod) / data.h));
    const base = (geometry.attributes.position as BufferAttribute).array.slice() as Float32Array;
    disposables.push(geometry);
    const velvet = new MeshPhysicalMaterial({ map: texture, alphaTest: 0.5, roughness: 0.95, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new Color(0x5a1a28), side: FrontSide, envMapIntensity: 0.12, toneMapped: false });
    const backside = new MeshPhysicalMaterial({ color: 0x3a0f18, alphaMap: alpha, alphaTest: 0.5, roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new Color(0x6a2232), side: BackSide, envMapIntensity: 0.12, toneMapped: false });
    disposables.push(velvet, backside);
    const cloth = new Group();
    cloth.add(new Mesh(geometry, velvet), new Mesh(geometry, backside));
    cloth.position.set(offsetX, clothH / 2, 0);
    root.add(cloth);
    // Վերևի մասը (խաչ, պարաններ, ձող)՝ հարթ կտրվածք։
    const topMaterial = new MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: DoubleSide, roughness: 0.8, metalness: 0, envMapIntensity: 0.15, toneMapped: false });
    disposables.push(topMaterial);
    const topPiece = flatPiece(texture, [0, 0, data.w, data.rod + 4], data.w, data.h, scale, data.h, data.w / 2, topMaterial);
    topPiece.position.x += offsetX;
    root.add(topPiece);
    // Փայտե ձողը՝ իրական գլան, կտորի ետևից իջնում է ներքև։
    const wood = new MeshStandardMaterial({ color: 0x6b4428, roughness: 0.55, metalness: 0.05 });
    disposables.push(wood);
    const poleLen = topY + 0.55;
    const poleGeometry = new CylinderGeometry(0.022, 0.026, poleLen, 20);
    disposables.push(poleGeometry);
    const pole = new Mesh(poleGeometry, wood);
    pole.position.set(0, topY - poleLen / 2 + 0.02, -0.035);
    root.add(pole);
    const rodGeometry = new CylinderGeometry(0.014, 0.014, width * 1.02, 16);
    disposables.push(rodGeometry);
    const rod = new Mesh(rodGeometry, metal("gold"));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(offsetX, topY + 0.004, -0.008);
    root.add(rod);
    root.position.y = 0.5;

    // Ծածանում. մշտական թեթև քամի + պտտելիս ճոճում (զսպանակ)։
    const pos = geometry.attributes.position as BufferAttribute;
    let lastAz = controls.getAzimuthalAngle(), swing = 0, vel = 0;
    tick.push((t, dt) => {
      const az = controls.getAzimuthalAngle();
      let d = az - lastAz; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      lastAz = az;
      vel += d * 6;
      vel += -swing * 26 * dt; vel *= Math.exp(-2.2 * dt); swing += vel * dt * 3;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const depth = Math.min(1, Math.max(0, (clothH / 2 - y) / clothH)); // 0 վերևում, 1 ներքևում
        const k = Math.pow(depth, 1.25);
        const wave = Math.sin(x * 5.5 + t * 1.6 + y * 1.3) * 0.022 + Math.sin(y * 4.2 - t * 1.1) * 0.016 + Math.sin(x * 11 - t * 2.3) * 0.006;
        pos.setZ(i, k * (wave + swing * 0.5 * (0.7 + 0.3 * Math.sin(x * 3 + y * 2))));
        pos.setX(i, x + k * swing * 0.06);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    });
    // Միայն կողքով պտտել (հետևը տեսնելու համար), վեր-վար՝ գրեթե ոչ։
    controls.minPolarAngle = Math.PI / 2 - 0.12;
    controls.maxPolarAngle = Math.PI / 2 + 0.08;
    controls.autoRotateSpeed = 0.7;
    target = new Vector3(0, 0.5 + (data.h * scale) / 2 - 0.05, 0);
    distance = fit(data.h * scale * 1.05, width);
  }

  // Վերևից շատ չնայել (ներսը դատարկ է), ներքևից էլ՝ ոչ։
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = Math.PI / 2 + 0.25;

  /** Հեռավորություն, որ իրը (բարձրություն × լայնություն) տեղավորվի կադրում։ */
  function fit(height: number, width: number) {
    const v = Math.tan((camera.fov * Math.PI) / 360);
    return Math.max(height / 2 / v, width / 2 / (v * 0.75)) * 1.18;
  }

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Նեղ էկրանին՝ հեռացնել, որ իրը տեղավորվի։
    camera.zoom = Math.min(1, (w / h) * 1.35);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // Օգտատերը սեղմեց՝ ինքնապտույտը դադարում է։
  const stopAuto = () => { controls.autoRotate = false; };
  renderer.domElement.addEventListener("pointerdown", stopAuto);

  const clock = new Clock();
  let frame = 0, visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(host);
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    const t = clock.elapsedTime;
    controls.update(dt);
    for (const fn of tick) fn(t, dt);
    renderer.render(scene, camera);
  };
  loop();
  void build().catch(() => onReady?.());

  return {
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect(); io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", stopAuto);
      controls.dispose();
      for (const d of disposables) d.dispose();
      scene.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).geometry?.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
    },
    setAutoRotate(on) { controls.autoRotate = on; },
    reset() { controls.reset(); },
    get toggleLid() { return lidToggle; },
  };
}
