// 3D տեսարանը՝ renderer, տեսախցիկ, կետեր։ Բեռնվում է միայն 3D էջում և միայն բրաուզերում։
// Էկրանը նկարվում է միայն շարժման պահին (անընդհատ ցիկլ չկա), ստվերներ չկան։
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, CylinderGeometry, DirectionalLight,
  Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PerspectiveCamera, Plane, Points, Raycaster, RingGeometry, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3,
  WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildChurch, createMaterials } from "./build";
import { candleSlot, computeHotspots, defaultView, edgesOf, insidePolygon, pointOnEdge, polygonOf, type ChurchModel, type Item, type Person, type Pt, type Role, type TourStep, type V3 } from "./model";

/** «walk»՝ ներսում քայլել (աչքի բարձրությունից), «cutaway»՝ վերևից (առանց տանիքի), «outside»՝ դրսից։ */
export type ViewMode = "walk" | "cutaway" | "outside";

export type ChurchScene = {
  setMode(mode: ViewMode): void;
  /** Այսօր վառված մոմերը մոմավառության սեղանին (տեղերի համարներ)։ */
  setCandles(slots: readonly number[]): void;
  /** Ընտրված պարագայի ոսկե օղակը (խմբագրիչ)։ */
  highlight(index: number | null): void;
  getView(): { mode: ViewMode; eye: V3; look: V3 };
  focus(eye: V3, look: V3): void;
  /** Խմբագրիչում՝ «Խմբագրել» (պարագաները քաշվում են) կամ «Դիտել» (միայն տեսախցիկ)։ */
  setEditing(on: boolean): void;
  /** Խմբագրիչում՝ հաջորդ սեղմումը պատին կախում է նոր սրբապատկեր (`onWallTap`)։ */
  setPlacing(on: boolean): void;
  select(id: string | null): void;
  showTour(step: TourStep | null): void;
  reset(): void;
  /** «Ներսից» ռեժիմում՝ մոտենալ կետին (մասի կամ պարագայի. պարագային՝ դիմացից)։ */
  approach(at: V3, item?: Item): void;
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
  /** «Կախել պատին» ռեժիմում՝ սեղմված պատի կետը (`y`՝ սեղմման բարձրությունը, `rot`՝ ուր է նայում պատը)։ */
  onWallTap?: (spot: { at: Pt; y: number; rot: number }) => void;
};

export function createChurchScene(host: HTMLElement, options: {
  model: ChurchModel;
  onPick: (id: string) => void;
  edit?: EditHooks;
  /** Սկզբնական տեսքը (խմբագրիչում՝ նախորդ տեսարանից, որ վերակառուցելիս տեսախցիկը չթռչի)։ */
  view?: { mode: ViewMode; eye: V3; look: V3 };
  /** Տեսարանը ինքն է փոխել ռեժիմը (օր.՝ դրսից դռան վրա սեղմելով մտավ ներս)։ */
  onModeChange?: (mode: ViewMode) => void;
  /** Առաջին անգամ քայլել/նայել է (հուշումը թաքցնելու համար)։ */
  onWalkStart?: () => void;
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
    button.addEventListener("click", () => {
      options.onPick(spot.id);
      if (mode === "walk") approachSpot(spot.at, spot.item);
    });
    overlay.appendChild(button);
    return { spot, button, at: new Vector3(...spot.at), shown: true };
  });

  // Կետերի վրա սկսված քաշելը, երկու մատով մոտեցնելը և մկնիկի անիվը պետք է գնան մոդելին, ոչ թե էջին
  // (առաջ կետի վրա ընկած մատը մոտեցնում էր ամբողջ էջը)։ Կետին հպումը մնում է սեղմում, եթե մատը չի շարժվել։
  const canvas = renderer.domElement;
  const pending = new Map<number, PointerEvent>();
  const forward = (event: PointerEvent, type = event.type) => canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
    clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
    bubbles: true, cancelable: true,
  }));
  const release = () => { for (const down of pending.values()) forward(down, "pointerdown"); pending.clear(); };
  const onDotDown = (event: PointerEvent) => {
    if (event.target === overlay) return;
    pending.set(event.pointerId, event);
    // Երկրորդ մատը (կամ մատը կետի վրա, երբ մյուսը արդեն մոդելին է)՝ միանգամից մոդելին։
    if (pending.size > 1 || activePointers > 0) release();
  };
  const onDotMove = (event: PointerEvent) => {
    const down = pending.get(event.pointerId);
    if (down && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 6) release();
  };
  const onDotEnd = (event: PointerEvent) => { pending.delete(event.pointerId); };
  let activePointers = 0;
  const countDown = () => { activePointers++; };
  const countUp = () => { activePointers = Math.max(0, activePointers - 1); };
  canvas.addEventListener("pointerdown", countDown);
  canvas.addEventListener("pointerup", countUp);
  canvas.addEventListener("pointercancel", countUp);
  overlay.addEventListener("pointerdown", onDotDown);
  window.addEventListener("pointermove", onDotMove);
  window.addEventListener("pointerup", onDotEnd);
  window.addEventListener("pointercancel", onDotEnd);
  // Անիվը/թաչփեդի «pinch»-ը կետի վրա՝ նույնպես մոդելին (Chrome-ում pinch = ctrl+wheel), Safari-ի gesture-ը՝ արգելված։
  const onWheel = (event: WheelEvent) => {
    if (event.target === canvas) return;
    event.preventDefault();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey, clientX: event.clientX, clientY: event.clientY, bubbles: true, cancelable: true }));
  };
  const stopGesture = (event: Event) => event.preventDefault();
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("gesturestart", stopGesture);
  host.addEventListener("gesturechange", stopGesture);

  let mode: ViewMode = "walk";
  let frame = 0;
  let width = 1;
  let height = 1;
  const projected = new Vector3();

  function placeDots() {
    for (const dot of dots) {
      let show = dot.spot.view === (mode === "outside" ? "outside" : "inside");
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
    if (mode === "walk") {
      stopMove();
      camera.position.set(...eye);
      aim(new Vector3(...look));
      return;
    }
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
  const shouldFlicker = () => !calm && onScreen && !document.hidden && mode !== "outside";
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
    interior.visible = next !== "outside";
    exterior.visible = next === "outside";
    controls.minDistance = next === "outside" ? 8 : 0.4;
    // «Ներսից»՝ տեսախցիկը կառավարում ենք մենք (պտտվում է իր տեղում), OrbitControls-ը անջատված է։
    controls.enabled = next !== "walk";
    stopMove();
    resize();
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    flicker.scale.value = (height * dpr) / 2;
    camera.aspect = width / height;
    // Նեղ (ուղղահայաց) էկրանին տեսադաշտը լայնացնում ենք, որ շենքը տեղավորվի։
    camera.fov = mode === "walk" ? walkFov : camera.aspect < 1 ? Math.min(62, 45 / Math.sqrt(camera.aspect)) : 45;
    camera.updateProjectionMatrix();
    requestRender();
  }

  const home = (m: ViewMode) => {
    if (m === "walk") { walkHome(); return; }
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
  let editing = true;
  let placing = false;
  function onDown(event: PointerEvent) {
    if (options.edit && placing && mode !== "outside" && event.target === renderer.domElement) {
      toPointer(event);
      const found = raycaster.intersectObject(interior, true).find((h) => solid(h.object));
      const n = found?.face ? found.face.normal.clone().transformDirection(found.object.matrixWorld) : null;
      if (!found || !n || Math.abs(n.y) > 0.5) return; // պատ չէ (հատակ/առաստաղ)՝ սպասում ենք հաջորդ սեղմմանը
      event.stopPropagation();
      const at: Pt = [Math.round((found.point.x + n.x * 0.03) * 100) / 100, Math.round((found.point.z + n.z * 0.03) * 100) / 100];
      const rot = Math.round((Math.atan2(n.x, n.z) * 180) / Math.PI);
      options.edit.onWallTap?.({ at, y: Math.round(found.point.y * 100) / 100, rot });
      return;
    }
    if (!options.edit || !editing || mode === "outside" || event.target !== renderer.domElement) return;
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
  // ---------- «Ներսից»՝ քայլել եկեղեցում (տիրոջ խնդրանքով, 2026-11-27) ----------
  // Մատը սահեցնել՝ նայել շուրջը (տեսախցիկը պտտվում է իր տեղում), սեղմել հատակին՝ գնալ այնտեղ,
  // սեղմել սրբապատկերի/պարագայի/պատի վրա՝ մոտենալ դիմացը։ Պատերի և սյուների միջով չի անցնում։
  const EYE = 1.6;
  const look = { yaw: 0, pitch: 0 };
  const defaultFov = () => (camera.aspect < 1 ? 74 : 62);
  let walkFov = 68;
  let fovTouched = false;
  const rooms = model.rooms.filter((room) => !room.ghost);
  const polygons = rooms.map((room) => polygonOf(room.outline));
  const walkable = (x: number, z: number) => polygons.some((poly) => insidePolygon(poly, x, z));
  // Դրսի դռները (մուտքերը)՝ դրսից սեղմելով ներս մտնելու և «Ներսից»-ի սկզբնական տեղի համար։
  const entries: Array<{ at: Vector3; inward: Vector3; main: boolean }> = [];
  for (const room of rooms) {
    const edges = edgesOf(room.outline);
    for (const door of room.doors ?? []) {
      const edge = edges[door.edge];
      if (!edge || edge.bulge) continue;
      const { p, n } = pointOnEdge(edge, door.at);
      if (walkable(p[0] - n[0] * 0.8, p[1] - n[1] * 0.8)) continue; // դուռը տանում է ուրիշ սենյակ, ոչ դուրս
      entries.push({ at: new Vector3(p[0], 0, p[1]), inward: new Vector3(n[0], 0, n[1]).normalize(), main: door.part === "mutq" });
    }
  }
  const mainEntry = entries.find((entry) => entry.main) ?? [...entries].sort((a, b) => b.at.z - a.at.z)[0];

  function lookDir(yaw: number, pitch: number, out = new Vector3()) {
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }
  const ahead = new Vector3();
  function applyLook() {
    camera.lookAt(ahead.copy(camera.position).add(lookDir(look.yaw, look.pitch)));
    requestRender();
  }
  function yawPitchTo(target: Vector3, from = camera.position) {
    const d = target.clone().sub(from);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }
  function aim(target: Vector3) {
    Object.assign(look, yawPitchTo(target));
    applyLook();
  }
  /** Մուտքից մի քանի քայլ ներս, այնտեղ, որտեղ առջևը բաց է (ոչ պատշգամբի սյան հետևում)։ */
  function entrySpot(entry: { at: Vector3; inward: Vector3 }) {
    const spotAt = (d: number) => entry.at.clone().addScaledVector(entry.inward, d).setY(EYE);
    const open = [2.2, 3.4, 4.6, 1.4, 5.8].find((d) => {
      const p = spotAt(d);
      return walkable(p.x, p.z) && clearDistance(p, p.clone().addScaledVector(entry.inward, 4)) >= 3.5;
    }) ?? 2.2;
    return spotAt(open);
  }
  function walkHome() {
    stopMove();
    if (!fovTouched) walkFov = defaultFov();
    if (mainEntry) {
      camera.position.copy(entrySpot(mainEntry));
      look.yaw = Math.atan2(-mainEntry.inward.x, -mainEntry.inward.z);
    } else {
      const box = polygons.flat();
      const cx = box.reduce((s, p) => s + p[0], 0) / Math.max(1, box.length);
      const cz = Math.max(...box.map((p) => p[1]), 0) - 2;
      camera.position.set(cx, EYE, cz);
      look.yaw = 0;
    }
    look.pitch = 0.02;
    resize();
    applyLook();
  }

  // Սահուն տեղափոխում (կամ միանգամից, եթե հեռախոսում «քիչ շարժում» է միացված)։
  let anim = 0;
  let move: { from: Vector3; to: Vector3; yaw0: number; yaw1: number; pitch0: number; pitch1: number; start: number; dur: number } | null = null;
  const mark = new Mesh(new RingGeometry(0.22, 0.3, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: "#e2c27e", transparent: true, opacity: 0, depthWrite: false }));
  mark.visible = false;
  interior.add(mark);
  let markStart = 0;
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  function stopMove() { move = null; }
  function step(now: number) {
    anim = 0;
    let more = false;
    if (move) {
      const t = Math.min(1, (now - move.start) / move.dur);
      const e = ease(t);
      camera.position.lerpVectors(move.from, move.to, e);
      look.yaw = move.yaw0 + (move.yaw1 - move.yaw0) * e;
      look.pitch = move.pitch0 + (move.pitch1 - move.pitch0) * e;
      camera.lookAt(ahead.copy(camera.position).add(lookDir(look.yaw, look.pitch)));
      if (t < 1) more = true; else move = null;
    }
    if (mark.visible) {
      const t = (now - markStart) / 1000;
      (mark.material as MeshBasicMaterial).opacity = t < 0.15 ? t / 0.15 * 0.9 : Math.max(0, 0.9 * (1 - (t - 0.15) / 0.85));
      mark.scale.setScalar(1 + t * 0.35);
      if (t >= 1) mark.visible = false; else more = true;
    }
    render();
    if (more) anim = requestAnimationFrame(step);
  }
  function kick() { if (!anim) anim = requestAnimationFrame(step); }
  function glide(to: Vector3, yaw: number, pitch: number) {
    let yaw1 = yaw;
    while (yaw1 - look.yaw > Math.PI) yaw1 -= Math.PI * 2;
    while (yaw1 - look.yaw < -Math.PI) yaw1 += Math.PI * 2;
    if (calm) {
      camera.position.copy(to);
      look.yaw = yaw1;
      look.pitch = pitch;
      applyLook();
      return;
    }
    const dist = camera.position.distanceTo(to);
    const dur = Math.min(1800, Math.max(450, (dist / 2.4) * 1000, Math.abs(yaw1 - look.yaw) * 380));
    move = { from: camera.position.clone(), to: to.clone(), yaw0: look.yaw, yaw1, pitch0: look.pitch, pitch1: pitch, start: performance.now(), dur };
    kick();
  }

  const down = new Vector3(0, -1, 0);
  /** Հատակի բարձրությունը կետում (բեմ, պատշգամբ)՝ վերևից ներքև ճառագայթով։ */
  function floorAt(x: number, z: number, above: number) {
    raycaster.set(new Vector3(x, above, z), down);
    const hit = raycaster.intersectObject(interior, true).find((h) => solid(h.object) && (h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.6 : false));
    return hit ? hit.point.y : null;
  }
  function solid(object: Object3D) {
    if (object instanceof Points || object === mark || object === ring) return false;
    for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  /** Ճանապարհին պատ կամ սյուն կա՞. վերադարձնում է, թե որքան կարելի է գնալ։ */
  function clearDistance(from: Vector3, to: Vector3) {
    const flat = new Vector3(to.x - from.x, 0, to.z - from.z);
    const total = flat.length();
    if (total < 0.05) return total;
    raycaster.set(new Vector3(from.x, from.y - EYE + 1.4, from.z), flat.normalize());
    raycaster.far = total;
    const hit = raycaster.intersectObject(interior, true).find((h) => solid(h.object) && (!h.face || Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y) < 0.5));
    raycaster.far = Infinity;
    return hit ? Math.max(0, hit.distance - 0.45) : total;
  }
  function walkTo(x: number, floor: number, z: number, faceTo?: Vector3) {
    const from = camera.position.clone();
    let to = new Vector3(x, floor + EYE, z);
    const can = clearDistance(from, to);
    const want = Math.hypot(to.x - from.x, to.z - from.z);
    if (can < want - 0.01) {
      const k = want ? can / want : 0;
      to = new Vector3(from.x + (to.x - from.x) * k, from.y, from.z + (to.z - from.z) * k);
    }
    if (faceTo) {
      const { yaw, pitch } = yawPitchTo(faceTo, to);
      glide(to, yaw, Math.max(-0.9, Math.min(0.9, pitch)));
    } else {
      const moved = Math.hypot(to.x - from.x, to.z - from.z);
      const yaw = moved > 0.6 ? Math.atan2(-(to.x - from.x), -(to.z - from.z)) : look.yaw;
      glide(to, yaw, moved > 0.6 ? 0.02 : look.pitch);
    }
  }
  /** Կանգնել `center`-ի դիմաց `dist` հեռավորության վրա (`facing`՝ որ կողմից, առանց դրա՝ մեր կողմից)։ */
  function approachPoint(center: Vector3, dist = 2.2, facing?: Vector3) {
    const dir = (facing ?? new Vector3(camera.position.x - center.x, 0, camera.position.z - center.z)).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    let spot: Vector3 | null = null;
    for (let d = dist; d >= 0.5; d -= 0.25) {
      const c = center.clone().addScaledVector(dir, d);
      if (walkable(c.x, c.z)) { spot = c; break; }
    }
    if (!spot) return;
    const floor = floorAt(spot.x, spot.z, Math.max(camera.position.y, center.y) + 0.3) ?? camera.position.y - EYE;
    walkTo(spot.x, floor, spot.z, center);
  }
  const itemCenter = (item: Item) => {
    const y = item.y ?? 0;
    return item.type === "icon" || item.type === "procession-icon" ? new Vector3(item.at[0], y + (item.h ?? 1.6) / 2, item.at[1]) : new Vector3(item.at[0], y + 0.8, item.at[1]);
  };
  const itemFacing = (item: Item) => {
    const a = ((item.rot ?? 0) * Math.PI) / 180;
    return new Vector3(Math.sin(a), 0, Math.cos(a)); // rot 0՝ դեմքով դեպի արևմուտք (+z)
  };
  function approachItem(item: Item) {
    const flat = item.type === "icon" || item.type === "procession-icon";
    const size = Math.max(item.w ?? 1, item.h ?? 1.6);
    approachPoint(itemCenter(item), flat ? Math.max(1.6, size * 1.15) : 2.1, flat ? itemFacing(item) : undefined);
  }
  function approachSpot(at: V3, item?: Item) {
    if (item) approachItem(item);
    else approachPoint(new Vector3(...at));
  }
  function tapWalk(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(interior, true).find((h) => solid(h.object));
    if (!hit) return;
    const p = hit.point;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 1, 0);
    // Մոտակա պարագան (սրբապատկեր, սեղան, մոմակալ…)՝ մոտենալ դիմացը։
    let best: Item | null = null;
    let bestDist = Infinity;
    for (const item of model.items) {
      if (item.type === "chandelier" || item.type === "column" || item.type === "bench") continue;
      const reach = Math.max(0.8, (item.w ?? 1) / 2 + 0.3, (item.h ?? 0) / 2 + 0.2);
      const d = itemCenter(item).distanceTo(p);
      if (d < reach && d < bestDist) { best = item; bestDist = d; }
    }
    if (best) {
      approachItem(best);
    } else if (normal.y > 0.6) {
      if (!walkable(p.x, p.z)) return;
      mark.position.set(p.x, p.y + 0.02, p.z);
      mark.visible = true;
      markStart = performance.now();
      walkTo(p.x, p.y, p.z);
    } else if (Math.abs(normal.y) < 0.6) {
      approachPoint(p.clone(), 2.2, new Vector3(normal.x, 0, normal.z));
    }
  }
  function enterAt(entry: { at: Vector3; inward: Vector3 }) {
    applyMode("walk");
    options.onModeChange?.("walk");
    if (!fovTouched) walkFov = defaultFov();
    resize();
    camera.position.copy(entry.at).addScaledVector(entry.inward, 0.6).setY(EYE);
    look.yaw = Math.atan2(-entry.inward.x, -entry.inward.z);
    look.pitch = 0.02;
    applyLook();
    const spot = entrySpot(entry);
    glide(spot, look.yaw, 0.02);
  }
  function tapOutside(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(exterior, true).find((h) => solid(h.object));
    if (!hit || hit.point.y > 5) return;
    const entry = entries
      .map((item) => ({ item, d: Math.hypot(item.at.x - hit.point.x, item.at.z - hit.point.z) }))
      .filter((item) => item.d < 2.2)
      .sort((a, b) => a.d - b.d)[0]?.item;
    if (entry) enterAt(entry);
  }

  // Մատ/մկնիկ «Ներսից» ռեժիմում. մեկ մատ՝ նայել, երկու մատ կամ անիվ՝ մոտեցնել (տեսադաշտ), հպում՝ գնալ։
  const touches = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  let pinch = 0;
  let dragged = false;
  let started = false;
  const begin = () => { if (!started) { started = true; options.onWalkStart?.(); } };
  function walkDown(event: PointerEvent) {
    if (options.edit && editing && mode !== "outside") return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY, t0: performance.now() });
    if (touches.size === 1) dragged = false;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      dragged = true;
    }
    if (mode === "walk") canvas.setPointerCapture?.(event.pointerId);
  }
  function walkMove(event: PointerEvent) {
    const t = touches.get(event.pointerId);
    if (!t) return;
    const dx = event.clientX - t.x;
    const dy = event.clientY - t.y;
    t.x = event.clientX;
    t.y = event.clientY;
    if (!dragged && Math.hypot(t.x - t.x0, t.y - t.y0) > 7) dragged = true;
    if (mode !== "walk" || !dragged) return;
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomWalk(pinch / dist);
      pinch = dist;
      return;
    }
    begin();
    stopMove();
    const k = ((camera.fov * Math.PI) / 180) / Math.max(1, height);
    look.yaw += dx * k;
    look.pitch = Math.max(-1.25, Math.min(1.25, look.pitch + dy * k));
    applyLook();
  }
  function walkUp(event: PointerEvent) {
    const t = touches.get(event.pointerId);
    touches.delete(event.pointerId);
    if (!t || event.type === "pointercancel") return;
    const tap = !dragged && touches.size === 0 && performance.now() - t.t0 < 700;
    if (!tap) return;
    if (mode === "walk") { begin(); tapWalk(event.clientX, event.clientY); }
    else if (mode === "outside" && !options.edit) tapOutside(event.clientX, event.clientY);
  }
  function zoomWalk(factor: number) {
    fovTouched = true;
    walkFov = Math.max(30, Math.min(85, walkFov * factor));
    resize();
  }
  canvas.addEventListener("pointerdown", walkDown);
  canvas.addEventListener("pointermove", walkMove);
  canvas.addEventListener("pointerup", walkUp);
  canvas.addEventListener("pointercancel", walkUp);
  canvas.addEventListener("wheel", (event) => {
    if (mode !== "walk") return;
    event.preventDefault();
    zoomWalk(Math.exp(event.deltaY * 0.0015));
  }, { passive: false });

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  if (options.view) {
    applyMode(options.view.mode);
    focus(options.view.eye, options.view.look);
  } else {
    // Խմբագրիչում՝ վերևից (պարագաները դասավորելու համար), կայքում՝ ներսից, մուտքի մոտից։
    const start: ViewMode = options.edit ? "cutaway" : "walk";
    applyMode(start);
    home(start);
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
    setEditing(on: boolean) { editing = on; },
    setPlacing(on: boolean) { placing = on; },
    getView: () => ({ mode, eye: camera.position.toArray() as unknown as V3, look: (mode === "walk" ? camera.position.clone().add(lookDir(look.yaw, look.pitch)) : controls.target).toArray() as unknown as V3 }),
    approach(at, item) { if (mode === "walk") approachSpot(at, item); },
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
        if (mode !== "cutaway") { applyMode("cutaway"); options.onModeChange?.("cutaway"); }
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
      cancelAnimationFrame(anim);
      window.clearTimeout(tick);
      canvas.removeEventListener("pointerdown", walkDown);
      canvas.removeEventListener("pointermove", walkMove);
      canvas.removeEventListener("pointerup", walkUp);
      canvas.removeEventListener("pointercancel", walkUp);
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
      window.removeEventListener("pointermove", onDotMove);
      window.removeEventListener("pointerup", onDotEnd);
      window.removeEventListener("pointercancel", onDotEnd);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("gesturestart", stopGesture);
      host.removeEventListener("gesturechange", stopGesture);
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
