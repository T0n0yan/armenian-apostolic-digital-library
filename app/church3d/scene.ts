// 3D տեսարանը՝ renderer, տեսախցիկ, կետեր։ Բեռնվում է միայն 3D էջում և միայն բրաուզերում։
// Էկրանը նկարվում է միայն շարժման պահին (անընդհատ ցիկլ չկա), ստվերներ չկան։
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, DirectionalLight, Group, HemisphereLight,
  LatheGeometry, Mesh, MeshLambertMaterial, PerspectiveCamera, Points, PointsMaterial, Scene, SphereGeometry, Vector2,
  Vector3, WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildChurch, createMaterials } from "./build";
import { computeHotspots, defaultView, type ChurchModel, type Person, type Role, type TourStep, type V3 } from "./model";

export type ViewMode = "cutaway" | "outside";

export type ChurchScene = {
  setMode(mode: ViewMode): void;
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
function glowPoints(points: Vector3[], size: number, texture: CanvasTexture) {
  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new PointsMaterial({ map: texture, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.85 });
  return new Points(geometry, material);
}

function placePerson(group: Group, person: Person) {
  group.position.set(...person.at);
  group.rotation.y = ((person.rot ?? 0) * Math.PI) / 180;
  return group;
}

export function createChurchScene(host: HTMLElement, options: { model: ChurchModel; onPick: (id: string) => void }): ChurchScene {
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

  const materials = createMaterials(model.tuff);
  const { interior, exterior, curtainOpen, curtainClosed, glows } = buildChurch(model, materials);
  scene.add(interior, exterior);
  const texture = glowTexture();
  if (glows.small.length) interior.add(glowPoints(glows.small, 0.28, texture));
  if (glows.large.length) interior.add(glowPoints(glows.large, 0.9, texture));

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

  const home = (m: ViewMode) => {
    const view = defaultView(model, m);
    focus(view.eye, view.look);
  };

  controls.addEventListener("change", requestRender);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyMode("cutaway");
  home("cutaway");
  resize();

  return {
    setMode(next) {
      if (next === mode) return;
      applyMode(next);
      home(next);
    },
    focus,
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
      observer.disconnect();
      controls.dispose();
      const disposed = new Set<Material>(materials.values());
      scene.traverse((object) => {
        if (!(object instanceof Mesh) && !(object instanceof Points)) return;
        object.geometry.dispose();
        disposed.add(object.material as Material);
      });
      for (const m of disposed) m.dispose();
      people.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
