// Պարագայի մանրամասն դիտումը (սկիհ, բուրվառ, քշոց…)՝ փոքր պատուհան, որ մատով պտտվում է։
// Նույն պարագան է, ինչ եկեղեցում, բայց ավելի մանրամասն (`itemParts(item, true)`)։
import {
  AdditiveBlending, Box3, BufferGeometry, CanvasTexture, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Points,
  PointsMaterial, Scene, Sphere, Vector3, WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createMaterials, itemParts } from "./build";
import type { Item, ItemType } from "./model";

/** Բարձր պարագաների դեպքում նայում ենք գլխավոր մասին (ոչ թե ձողին)։ */
const FOCUS: Partial<Record<ItemType, { center: [number, number, number]; radius: number }>> = {
  fan: { center: [0, 2.25, 0], radius: 0.5 },
  "procession-icon": { center: [0, 2.5, 0], radius: 0.65 },
  censer: { center: [0, 1.3, 0.3], radius: 0.55 },
};

export function createItemViewer(host: HTMLElement, item: Item) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "church3d-canvas";
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight("#fff4e4", "#5a4038", 2.6));
  const sun = new DirectionalLight("#ffe7c2", 1.8);
  sun.position.set(-2, 4, 3);
  scene.add(sun);

  const materials = createMaterials("pink");
  const kit = itemParts({ ...item, at: [0, 0], y: 0, rot: 0 }, true);
  const group = kit.build(materials, "pink", 3);
  scene.add(group);

  // Բոցի շող։
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,236,190,1)");
  gradient.addColorStop(0.25, "rgba(255,200,120,0.55)");
  gradient.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  const glows = [...kit.glows.small, ...kit.glows.large];
  if (glows.length) {
    scene.add(new Points(new BufferGeometry().setFromPoints(glows), new PointsMaterial({ map: texture, size: 0.18, transparent: true, depthWrite: false, blending: AdditiveBlending })));
  }

  const focus = FOCUS[item.type];
  const sphere = focus ? new Sphere(new Vector3(...focus.center), focus.radius) : new Box3().setFromObject(group).getBoundingSphere(new Sphere());
  const camera = new PerspectiveCamera(35, 1, 0.01, 100);
  const distance = sphere.radius / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  camera.position.copy(sphere.center).add(new Vector3(0.45, 0.3, 1).normalize().multiplyScalar(distance));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(sphere.center);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = distance * 0.4;
  controls.maxDistance = distance * 2.5;
  controls.update();

  let frame = 0;
  const render = () => { frame = 0; renderer.render(scene, camera); };
  const requestRender = () => { if (!frame) frame = requestAnimationFrame(render); };
  controls.addEventListener("change", requestRender);
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
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
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
