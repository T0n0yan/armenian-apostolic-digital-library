// 3D տեսարանը՝ renderer, տեսախցիկ, կետեր։ Բեռնվում է միայն 3D էջում և միայն բրաուզերում։
// Էկրանը նկարվում է միայն շարժման պահին (անընդհատ ցիկլ չկա), ստվերներ չկան։
import {
  CapsuleGeometry, DirectionalLight, Group, HemisphereLight, LatheGeometry, Mesh, MeshLambertMaterial, PerspectiveCamera,
  Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildChurch, createMaterials } from "./build";
import { computeHotspots, defaultView, type ChurchModel, type TourStep, type V3 } from "./model";

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

/** Պարզ մարդուկ՝ առանց դեմքի. զգեստ, ուսեր, ձեռքեր, գլուխ (~1,75 մ)։ */
function person(robe: Material, skin: Material) {
  const group = new Group();
  const body = new LatheGeometry([[0, 0], [0.3, 0], [0.29, 0.15], [0.23, 0.8], [0.2, 1.2], [0.19, 1.36], [0.12, 1.45], [0.06, 1.48], [0, 1.48]].map(([r, h]) => new Vector2(r, h)), 16);
  group.add(new Mesh(body, robe));
  for (const side of [-1, 1]) {
    const arm = new Mesh(new CapsuleGeometry(0.055, 0.5, 4, 8), robe);
    arm.position.set(side * 0.2, 1.1, 0.12);
    arm.rotation.set(-0.75, 0, side * 0.12);
    group.add(arm);
    const hand = new Mesh(new SphereGeometry(0.05, 8, 6), skin);
    hand.position.set(side * 0.17, 0.9, 0.36);
    group.add(hand);
  }
  const head = new Mesh(new SphereGeometry(0.12, 16, 12), skin);
  head.position.y = 1.62;
  group.add(head);
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
  const { interior, exterior, curtainOpen, curtainClosed } = buildChurch(model, materials);
  scene.add(interior, exterior);

  const robe = new MeshLambertMaterial({ color: ROBE });
  const priest = person(robe, new MeshLambertMaterial({ color: "#d9b79c" }));
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
