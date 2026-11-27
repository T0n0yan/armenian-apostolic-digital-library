// 3D տեսարանը՝ renderer, տեսախցիկ, կետեր։ Բեռնվում է միայն 3D էջում և միայն բրաուզերում։
// Էկրանը նկարվում է միայն շարժման պահին (անընդհատ ցիկլ չկա), ստվերներ չկան։
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, CylinderGeometry, DirectionalLight,
  Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PerspectiveCamera, Plane, Points, Raycaster, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3,
  WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildChurch, createMaterials } from "./build";
import { candleSlot, computeHotspots, defaultView, type ChurchModel, type Person, type Pt, type Role, type TourStep, type V3 } from "./model";

export type ViewMode = "cutaway" | "outside";

export type ChurchScene = {
  setMode(mode: ViewMode): void;
  /** Այսօր վառված մոմերը մոմավառության սեղանին (տեղերի համարներ)։ */
  setCandles(slots: readonly number[]): void;
  /** Ընտրված պարագայի ոսկե օղակը (խմբագրիչ)։ */
  highlight(index: number | null): void;
  getView(): { mode: ViewMode; eye: V3; look: V3 };
  focus(eye: V3, look: V3): void;
  select(id: string | null): void;
  showTour(step: TourStep | null): void;
  reset(): void;
  dispose(): void;
};

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const ROBE = "#1e1b1f";
const VESTED = "#b8862f";
const ROLE_COLORS: Record<Role, string[]> = {
  priest: [ROBE],
  deacon: ["#ece5d8"],
  dpir: ["#e6e0d4"],
  believer: ["#5b6b7a", "#7a5b5b", "#4f5f4a", "#6b5a74", "#8a7a62"],
};

/** Մարդուկներ՝ առանց դեմքի. զգեստ, ուսեր, ձեռքեր, գլուխ (~1,75 մ)։ Երկրաչափությունը ընդհանուր է բոլորի համար։ */
function createPeople() {
  const body = new LatheGeometry([[0, 0], [0.3, 0], [0.29, 0.15], [0.23, 0.8], [0.2, 1.2], [0.19, 1.36], [0.12, 1.45], [0.06, 1.48], [0, 1.48]].map(([r, h]) => new Vector2(r, h)), 16);
  const arm = new CapsuleGeometry(0.055, 0.5, 4, 8);
  const hand = new SphereGeometry(0.05, 8, 6);
  const head = new SphereGeometry(0.12, 16, 12);
  // Սարկավագի ուրար՝ ուսից կրծքով իջնող ժապավեն։
  const band = new BoxGeometry(0.1, 0.9, 0.02).rotateZ(0.5).translate(0.02, 1.05, 0.215);
  const skin = new MeshLambertMaterial({ color: "#d9b79c" });
  const red = new MeshLambertMaterial({ color: "#8e1f28" });
  const robes = new Map<string, MeshLambertMaterial>();
  const robeOf = (color: string) => {
    const cached = robes.get(color) ?? new MeshLambertMaterial({ color });
    robes.set(color, cached);
    return cached;
  };
  function make(role: Role, index = 0, robe?: MeshLambertMaterial) {
    const colors = ROLE_COLORS[role];
    const material = robe ?? robeOf(colors[index % colors.length]);
    const group = new Group();
    group.add(new Mesh(body, material));
    for (const side of [-1, 1]) {
      const a = new Mesh(arm, material);
      a.position.set(side * 0.2, 1.1, 0.12);
      a.rotation.set(-0.75, 0, side * 0.12);
      const h = new Mesh(hand, skin);
      h.position.set(side * 0.17, 0.9, 0.36);
      group.add(a, h);
    }
    const head3 = new Mesh(head, skin);
    head3.position.y = 1.62;
    group.add(head3);
    if (role === "deacon") group.add(new Mesh(band, red));
    return group;
  }
  const geometries: BufferGeometry[] = [body, arm, hand, head, band];
  return { make, dispose() { for (const g of geometries) g.dispose(); for (const m of robes.values()) m.dispose(); skin.dispose(); red.dispose(); } };
}

/** Փափուկ շող (կլոր գրադիենտ)՝ բոցերի և լամպերի համար։ */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,236,190,1)");
  g.addColorStop(0.25, "rgba(255,200,120,0.55)");
  g.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** Բոլոր շողերը՝ մեկ Points-ով (մեկ draw call), առանց իրական լույսի աղբյուրների։ */
/** Թրթռացող շող. չափը և պայծառությունը փոխվում են GPU-ում (`time`), ամեն կետ՝ իր փուլով։ */
type Flicker = { time: { value: number }; scale: { value: number } };
function glowPoints(points: Vector3[], size: number, texture: CanvasTexture, flicker: Flicker, amount: number) {
  const geometry = new BufferGeometry().setFromPoints(points);
  geometry.setAttribute("phase", new Float32BufferAttribute(points.map((_, i) => (i * 2.399) % (Math.PI * 2)), 1));
  const material = new ShaderMaterial({
    uniforms: { map: { value: texture }, time: flicker.time, scale: flicker.scale, size: { value: size }, amount: { value: amount } },
    vertexShader: `
      attribute float phase;
      uniform float time, scale, size, amount;
      varying float vFlicker;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFlicker = 1.0 - amount + amount * (0.6 * sin(time * 6.3 + phase) + 0.4 * sin(time * 11.7 + phase * 1.7));
        gl_PointSize = size * (0.85 + 0.15 * vFlicker) * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying float vFlicker;
      void main() {
        vec4 c = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(c.rgb, c.a * 0.85 * clamp(vFlicker, 0.0, 1.2));
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  return new Points(geometry, material);
}

function placePerson(group: Group, person: Person) {
  group.position.set(...person.at);
  group.rotation.y = ((person.rot ?? 0) * Math.PI) / 180;
  return group;
}

/** Խմբագրիչի համար՝ պարագաները սեղմվում և քաշվում են 3D-ում։ */
export type EditHooks = {
  onSelectItem: (index: number | null) => void;
  onMoveItem: (index: number, at: Pt) => void;
};

export function createChurchScene(host: HTMLElement, options: {
  model: ChurchModel;
  onPick: (id: string) => void;
  edit?: EditHooks;
  /** Սկզբնական տեսքը (խմբագրիչում՝ նախորդ տեսարանից, որ վերակառուցելիս տեսախցիկը չթռչի)։ */
  view?: { mode: ViewMode; eye: V3; look: V3 };
}): ChurchScene {
  const { model } = options;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new WebGLRenderer({ antialias: dpr < 2, alpha: true });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "church3d-canvas";
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight("#fff4e4", "#5a4038", 2.4));
  const sun = new DirectionalLight("#ffe7c2", 1.6);
  sun.position.set(-8, 22, 12);
  scene.add(sun);

  const materials = createMaterials(model.tuff, model.look);
  const { interior, exterior, curtainOpen, curtainClosed, glows, itemGroups } = buildChurch(model, materials, { separateItems: Boolean(options.edit), onPictureLoaded: () => requestRender() });
  scene.add(interior, exterior);
  const texture = glowTexture();
  const flicker: Flicker = { time: { value: 0 }, scale: { value: 1 } };
  if (glows.small.length) interior.add(glowPoints(glows.small, 0.28, texture, flicker, 0.35));
  if (glows.large.length) interior.add(glowPoints(glows.large, 0.9, texture, flicker, 0.12));

  // Մոմավառության սեղանի մոմերը՝ այսօր վառվածները (մեկ InstancedMesh մոմերի, մեկը՝ բոցերի, մեկ Points՝ շողի)։
  const table = model.items.find((item) => item.type === "candle-table");
  const tableMatrix = table ? new Matrix4().makeRotationY(((table.rot ?? 0) * Math.PI) / 180).setPosition(table.at[0], (table.y ?? 0) + 0.79, table.at[1]) : null;
  const candleBody = new CylinderGeometry(0.012, 0.012, 1, 6).translate(0, 0.5, 0);
  const candleFlame = new BoxGeometry(0.022, 0.05, 0.022).translate(0, 0.025, 0);
  const candles = new Group();
  interior.add(candles);
  function setCandles(slots: readonly number[]) {
    for (const child of candles.children) {
      if (child instanceof Points) { child.geometry.dispose(); (child.material as Material).dispose(); }
      if (child instanceof InstancedMesh) child.dispose();
    }
    candles.clear();
    if (!tableMatrix || !slots.length) { requestRender(); return; }
    const bodies = new InstancedMesh(candleBody, materials.get("marble"), slots.length);
    const flames = new InstancedMesh(candleFlame, materials.get("glow"), slots.length);
    const tips: Vector3[] = [];
    const m = new Matrix4();
    slots.forEach((slot, i) => {
      const [x, h, z] = candleSlot(slot);
      bodies.setMatrixAt(i, m.makeScale(1, h, 1).setPosition(x, 0, z).premultiply(tableMatrix));
      flames.setMatrixAt(i, m.makeTranslation(x, h, z).premultiply(tableMatrix));
      tips.push(new Vector3(x, h + 0.03, z).applyMatrix4(tableMatrix));
    });
    candles.add(bodies, flames, glowPoints(tips, 0.24, texture, flicker, 0.4));
    requestRender();
  }

  const people = createPeople();
  const robe = new MeshLambertMaterial({ color: ROBE });
  const priest = people.make("priest", 0, robe);
  const crowd = new Group();
  interior.add(crowd);
  priest.rotation.y = Math.PI; // դեմքով դեպի արևելք (խորան)
  priest.visible = false;
  interior.add(priest);

  const camera = new PerspectiveCamera(45, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.rotateSpeed = 0.7;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI - 0.05;
  controls.maxDistance = 120;

  // Կետերը՝ սովորական կոճակներ canvas-ի վրա (հստակ տեքստ, մատով հեշտ սեղմվում են)։
  const overlay = document.createElement("div");
  overlay.className = "church3d-overlay";
  // Խմբագրիչում կետերը չենք ցույց տալիս՝ որ պարագաները սեղմելիս չխանգարեն։
  if (options.edit) overlay.hidden = true;
  host.appendChild(overlay);
  const dots = computeHotspots(model).map((spot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "church3d-dot";
    button.setAttribute("aria-label", spot.name);
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("span");
    label.textContent = spot.name;
    button.appendChild(label);
    button.addEventListener("click", () => options.onPick(spot.id));
    overlay.appendChild(button);
    return { spot, button, at: new Vector3(...spot.at), shown: true };
  });

  let mode: ViewMode = "cutaway";
  let frame = 0;
  let width = 1;
  let height = 1;
  const projected = new Vector3();

  function placeDots() {
    for (const dot of dots) {
      let show = dot.spot.view === (mode === "cutaway" ? "inside" : "outside");
      // Մանր պարագաների կետերը՝ միայն մոտիկից, որ ընդհանուր տեսքը չծանրաբեռնվի։
      if (show && dot.spot.near && camera.position.distanceTo(dot.at) > dot.spot.near) show = false;
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
    flicker.time.value = performance.now() / 1000;
    renderer.render(scene, camera);
    placeDots();
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function focus(eye: V3, look: V3) {
    camera.position.set(...eye);
    controls.target.set(...look);
    controls.update();
    requestRender();
  }

  // Բոցերի թրթռոց (տիրոջ թույլտվությամբ, 2026-11-26)՝ ~12 կադր/վրկ, միայն երբ 3D-ն էկրանին է, էջը բաց է,
  // ներսի տեսքն է, և հեռախոսում «քիչ շարժում» միացված չէ։ Մնացած ժամանակ ոչինչ չի նկարվում։
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let onScreen = true;
  let tick = 0;
  const shouldFlicker = () => !calm && onScreen && !document.hidden && mode === "cutaway";
  function loop() {
    tick = 0;
    if (!shouldFlicker()) return;
    requestRender();
    tick = window.setTimeout(loop, 83);
  }
  function updateLoop() {
    if (shouldFlicker() && !tick) tick = window.setTimeout(loop, 83);
  }
  const visibility = new IntersectionObserver(([entry]) => { onScreen = entry?.isIntersecting ?? true; updateLoop(); });
  visibility.observe(host);
  document.addEventListener("visibilitychange", updateLoop);

  function applyMode(next: ViewMode) {
    mode = next;
    updateLoop();
    interior.visible = next === "cutaway";
    exterior.visible = next === "outside";
    controls.minDistance = next === "outside" ? 8 : 0.4;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    flicker.scale.value = (height * dpr) / 2;
    camera.aspect = width / height;
    // Նեղ (ուղղահայաց) էկրանին տեսադաշտը լայնացնում ենք, որ շենքը տեղավորվի։
    camera.fov = camera.aspect < 1 ? Math.min(62, 45 / Math.sqrt(camera.aspect)) : 45;
    camera.updateProjectionMatrix();
    requestRender();
  }

  const home = (m: ViewMode) => {
    const view = defaultView(model, m);
    focus(view.eye, view.look);
  };

  controls.addEventListener("change", requestRender);

  // ---------- Խմբագրում 3D-ում՝ պարագան սեղմել (ընտրել) և քաշել հատակով ----------
  const ring = new Mesh(new TorusGeometry(0.55, 0.035, 6, 40).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: "#e2c27e" }));
  ring.visible = false;
  interior.add(ring);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  let drag: { group: Group; index: number; offset: Vector3; moved: boolean; startX: number; startY: number } | null = null;
  const toPointer = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  };
  const snapTo = (v: number) => Math.round(v * 10) / 10;
  function onDown(event: PointerEvent) {
    if (!options.edit || mode !== "cutaway" || event.target !== renderer.domElement) return;
    toPointer(event);
    const found = raycaster.intersectObjects(itemGroups, true)[0];
    if (!found) return;
    let group: Object3D | null = found.object;
    while (group && group.userData.item === undefined) group = group.parent;
    if (!group) return;
    controls.enabled = false;
    plane.constant = -group.position.y;
    raycaster.ray.intersectPlane(plane, hit);
    drag = { group: group as Group, index: group.userData.item as number, offset: group.position.clone().sub(hit), moved: false, startX: event.clientX, startY: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  }
  function onMove(event: PointerEvent) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    toPointer(event);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    drag.group.position.x = snapTo(hit.x + drag.offset.x);
    drag.group.position.z = snapTo(hit.z + drag.offset.z);
    ring.position.set(drag.group.position.x, drag.group.position.y + 0.02, drag.group.position.z);
    requestRender();
  }
  function onUp() {
    if (!drag) return;
    const { index, group, moved } = drag;
    drag = null;
    controls.enabled = true;
    if (moved) options.edit?.onMoveItem(index, [group.position.x, group.position.z]);
    else options.edit?.onSelectItem(index);
  }
  if (options.edit) {
    host.addEventListener("pointerdown", onDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
  }
  function highlight(index: number | null) {
    const group = index === null ? undefined : itemGroups[index];
    ring.visible = Boolean(group);
    if (group) ring.position.set(group.position.x, group.position.y + 0.02, group.position.z);
    requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  if (options.view) {
    applyMode(options.view.mode);
    focus(options.view.eye, options.view.look);
  } else {
    applyMode("cutaway");
    home("cutaway");
  }
  resize();

  return {
    setMode(next) {
      if (next === mode) return;
      applyMode(next);
      home(next);
    },
    focus,
    setCandles,
    highlight,
    getView: () => ({ mode, eye: camera.position.toArray() as unknown as V3, look: controls.target.toArray() as unknown as V3 }),
    select(id) {
      for (const dot of dots) dot.button.setAttribute("aria-pressed", String(dot.spot.id === id));
    },
    showTour(step) {
      priest.visible = Boolean(step);
      if (curtainOpen && curtainClosed) {
        curtainOpen.visible = !step?.curtainClosed;
        curtainClosed.visible = Boolean(step?.curtainClosed);
      }
      crowd.clear();
      for (const [i, p] of (step?.people ?? []).entries()) crowd.add(placePerson(people.make(p.role, i), p));
      if (step) {
        priest.position.set(...step.priest);
        priest.rotation.y = (((step.priestRot ?? 180) * Math.PI) / 180);
        robe.color.set(step.vested ? VESTED : ROBE);
        if (mode !== "cutaway") applyMode("cutaway");
        focus(step.eye, step.look);
      } else {
        requestRender();
      }
    },
    reset() {
      home(mode);
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(tick);
      host.removeEventListener("pointerdown", onDown, { capture: true });
      visibility.disconnect();
      document.removeEventListener("visibilitychange", updateLoop);
      observer.disconnect();
      candleBody.dispose();
      candleFlame.dispose();
      controls.dispose();
      const disposed = new Set<Material>(materials.values());
      scene.traverse((object) => {
        if (!(object instanceof Mesh) && !(object instanceof Points)) return;
        object.geometry.dispose();
        disposed.add(object.material as Material);
      });
      for (const m of disposed) { (m as Material & { map?: { dispose(): void } | null }).map?.dispose(); m.dispose(); }
      people.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
