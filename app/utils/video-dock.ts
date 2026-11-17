/**
 * Տեսանյութը փոքր պատուհանում (Picture-in-Picture) և էջից դուրս գալիս նվագելը շարունակելը։
 *
 * - PiP՝ ստանդարտ API (Chrome, Edge, Safari macOS) կամ Safari iPhone-ի `webkitSetPresentationMode`։
 * - Եթե տեսանյութը նվագում է, և մարդը գնում է կայքի մեկ այլ էջ, նույն `<video>`-ը (առանց կանգնելու)
 *   տեղափոխվում է էկրանի անկյան փոքր նվագարկիչ (dock), որը փակվում է ×-ով։
 * - Անկյան պատուհանը քաշվում է մատով, չափը փոխվում է ցանկացած անկյունից կամ երկու մատով։
 *   Առաջին սեղմումը ցույց է տալիս կոճակները, երկրորդը (կամ ↖↘)՝ բացում տեսանյութի էջը։
 * - Բաժնի ցանկում նվագող տեսանյութի քարտը նշվում է (`data-video-playing`), և էջը ոլորվում է դրան։
 * - Նույն տեսանյութի էջը նորից բացելիս dock-ը փակվում է, և նվագարկիչը շարունակում է նույն տեղից։
 * - Եթե տեսանյութը արդեն բրաուզերի փոքր պատուհանում է, dock-ը թաքնված է, որ երկու պատուհան չլինի։
 * - Փոքր պատուհանի կոճակը նվագարկիչի ներսում է (բրաուզերի կոճակները), առանձին կոճակ չկա։
 */

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

type MovableParent = HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };

export function isInPip(video: HTMLVideoElement) {
  return document.pictureInPictureElement === video || (video as WebkitVideo).webkitPresentationMode === "picture-in-picture";
}

let docked: { video: HTMLVideoElement; box: HTMLElement; href: string; cleanup: () => void } | null = null;

const LAYOUT_KEY = "video-dock-layout";
const MIN_WIDTH = 160;
const EDGE = 8;

type Layout = { left: number; top: number; width: number };

function readLayout(): Layout | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Layout | null;
    return value && [value.left, value.top, value.width].every(Number.isFinite) ? value : null;
  } catch {
    return null;
  }
}

function saveLayout(layout: Layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* գաղտնի ռեժիմ */ }
}

/** Պատուհանը միշտ մնում է էկրանի ներսում։ */
function applyLayout(box: HTMLElement, layout: Layout) {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - EDGE * 2);
  const width = Math.min(Math.max(layout.width, MIN_WIDTH), maxWidth);
  box.style.width = `${width}px`;
  const height = box.offsetHeight || width * 9 / 16;
  const left = Math.min(Math.max(layout.left, EDGE), window.innerWidth - width - EDGE);
  const top = Math.min(Math.max(layout.top, EDGE), window.innerHeight - height - EDGE);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.bottom = "auto";
  return { left, top, width };
}

/** Էջում նվագող տեսանյութի քարտը (օր.՝ բաժնի ցանկում) նշվում է, իսկ նոր էջ գալիս՝ ոլորվում է դրան։ */
export function markDockedCard(scroll = false) {
  if (typeof document === "undefined") return false;
  document.querySelectorAll("[data-video-playing]").forEach((node) => node.removeAttribute("data-video-playing"));
  if (!docked) return false;
  const href = docked.href;
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"))
    .find((anchor) => (anchor.getAttribute("href") ?? "").split(/[?#]/)[0] === href);
  const card = link?.closest("li") ?? link;
  if (!card) return false;
  card.setAttribute("data-video-playing", "");
  if (!scroll) return true;
  const rect = card.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
  return true;
}

function closeDock() {
  if (!docked) return;
  const { video, box, cleanup } = docked;
  docked = null;
  cleanup();
  video.pause();
  if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
  box.remove();
  markDockedCard();
}

/** Տեսանյութը մնում է նույնը. տեղափոխելիս նվագումը և PiP-ը չեն ընդհատվում (`moveBefore`, որտեղ կա)։ */
function moveInto(parent: MovableParent, video: HTMLVideoElement) {
  if (typeof parent.moveBefore === "function") {
    try { parent.moveBefore(video, null); return; } catch { /* հին բրաուզեր՝ սովորական տեղափոխում */ }
  }
  parent.appendChild(video);
}

const CORNER = 30;

type Gesture =
  | { mode: "move" | "corner"; x: number; y: number; layout: Layout; ratio: number; sx: number; sy: number; moved: boolean }
  | { mode: "pinch"; distance: number; layout: Layout; ratio: number; moved: true };

/**
 * Մեկ մատով քաշել՝ տեղաշարժում է, ցանկացած անկյունից քաշել կամ երկու մատով՝ փոխում է չափը։
 * Կարճ սեղմում. կոճակները թաքնված են՝ ցույց է տալիս, երևում են՝ բացում է տեսանյութի էջը։
 */
function makeInteractive(box: HTMLElement, surface: HTMLElement, ui: { show: () => void; visible: () => boolean }, open: () => void) {
  const points = new Map<number, { x: number; y: number }>();
  let gesture: Gesture | null = null;
  const current = (): Layout => {
    const rect = box.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width };
  };
  const ratioOf = (layout: Layout) => box.offsetHeight / Math.max(1, layout.width);
  const pinchDistance = () => {
    const [a, b] = Array.from(points.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const begin = (event: PointerEvent) => {
    const layout = current();
    const ratio = ratioOf(layout);
    if (points.size >= 2) {
      gesture = { mode: "pinch", distance: Math.max(1, pinchDistance()), layout, ratio, moved: true };
      return;
    }
    const rect = box.getBoundingClientRect();
    const nearLeft = event.clientX - rect.left < CORNER;
    const nearRight = rect.right - event.clientX < CORNER;
    const nearTop = event.clientY - rect.top < CORNER;
    const nearBottom = rect.bottom - event.clientY < CORNER;
    const corner = (nearLeft || nearRight) && (nearTop || nearBottom);
    gesture = {
      mode: corner ? "corner" : "move",
      x: event.clientX,
      y: event.clientY,
      layout,
      ratio,
      sx: nearLeft ? -1 : 1,
      sy: nearTop ? -1 : 1,
      moved: false,
    };
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    surface.setPointerCapture(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    begin(event);
    box.dataset.active = "";
  };
  const move = (event: PointerEvent) => {
    if (!points.has(event.pointerId) || !gesture) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { layout, ratio } = gesture;
    if (gesture.mode === "pinch") {
      if (points.size < 2) return;
      const width = layout.width * pinchDistance() / gesture.distance;
      const grow = width - layout.width;
      applyLayout(box, { left: layout.left - grow / 2, top: layout.top - grow * ratio / 2, width });
      ui.show();
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 8) return;
    gesture.moved = true;
    ui.show();
    if (gesture.mode === "move") {
      applyLayout(box, { ...layout, left: layout.left + dx, top: layout.top + dy });
      return;
    }
    // Անկյունից. հակառակ անկյունը մնում է տեղում։
    const { sx, sy } = gesture;
    const wanted = layout.width + Math.max(sx * dx, (sy * dy) / Math.max(ratio, 0.1));
    const width = Math.min(Math.max(wanted, MIN_WIDTH), window.innerWidth - EDGE * 2);
    const grow = width - layout.width;
    applyLayout(box, {
      left: sx < 0 ? layout.left - grow : layout.left,
      top: sy < 0 ? layout.top - grow * ratio : layout.top,
      width,
    });
  };
  const up = (event: PointerEvent) => {
    if (!points.delete(event.pointerId) || !gesture) return;
    const finished = gesture;
    if (points.size > 0) {
      // Մի մատը բարձրացավ. մյուսով շարունակում է տեղաշարժել։
      const [point] = Array.from(points.values());
      gesture = { mode: "move", x: point.x, y: point.y, layout: current(), ratio: ratioOf(current()), sx: 1, sy: 1, moved: true };
      return;
    }
    gesture = null;
    delete box.dataset.active;
    if (finished.moved) { saveLayout(current()); return; }
    if (event.type === "pointercancel") return;
    if (ui.visible()) open();
    else ui.show();
  };
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", up);
  const onResize = () => { if (box.style.left) applyLayout(box, current()); };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_PLAY = svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>');
const ICON_PAUSE = svg('<path d="M8 5v14M16 5v14"/>');
const ICON_BACK = svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>');
const ICON_FORWARD = svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>');
// Տեսանյութի էջը բացելու նշան (↖↘)։
const ICON_OPEN = svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');

/** Անկյան պատուհանի կոճակներ՝ 10 վրկ հետ, նվագել/կանգնեցնել, 10 վրկ առաջ։ */
function dockControls(video: HTMLVideoElement) {
  const bar = document.createElement("div");
  bar.className = "video-dock-controls";
  const button = (label: string, icon: string, action: () => void) => {
    const node = document.createElement("button");
    node.type = "button";
    node.setAttribute("aria-label", label);
    node.innerHTML = icon;
    node.addEventListener("click", (event) => { event.stopPropagation(); action(); });
    bar.appendChild(node);
    return node;
  };
  const seek = (delta: number) => {
    const end = Number.isFinite(video.duration) ? video.duration - 0.5 : Infinity;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, end));
  };
  button("10 վայրկյան հետ", ICON_BACK + "<small>10</small>", () => seek(-10));
  const toggle = button("Կանգնեցնել", ICON_PAUSE, () => { if (video.paused) void video.play().catch(() => {}); else video.pause(); });
  button("10 վայրկյան առաջ", ICON_FORWARD + "<small>10</small>", () => seek(10));
  const progress = document.createElement("span");
  progress.className = "video-dock-progress";
  progress.setAttribute("aria-hidden", "true");
  bar.appendChild(progress);
  const sync = () => {
    toggle.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
    toggle.setAttribute("aria-label", video.paused ? "Նվագել" : "Կանգնեցնել");
  };
  const tick = () => {
    const ratio = Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
    progress.style.setProperty("--progress", String(ratio));
  };
  sync();
  tick();
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  video.addEventListener("timeupdate", tick);
  return {
    bar,
    cleanup: () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("timeupdate", tick);
    },
  };
}

/**
 * Կանչվում է նվագարկիչի էջից հեռանալիս։ Եթե տեսանյութը նվագում է կամ PiP-ում է,
 * այն տեղափոխվում է անկյան փոքր նվագարկիչ և շարունակում է։ Վերադարձնում է՝ տեղափոխվե՞ց թե ոչ։
 * `href`-ը տեսանյութի էջն է. պատուհանին սեղմելիս այնտեղ է տանում։
 */
export function dockVideo(video: HTMLVideoElement, label: string, href: string) {
  if (typeof document === "undefined" || !video.isConnected) return false;
  if (video.paused && !isInPip(video)) return false;
  closeDock();

  const box = document.createElement("div") as MovableParent;
  box.className = "video-dock";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Նվագող տեսանյութ");
  const surface = document.createElement("button");
  surface.type = "button";
  surface.className = "video-dock-surface";
  surface.setAttribute("aria-label", `Բացել տեսանյութի էջը՝ ${label}`);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "video-dock-close";
  close.setAttribute("aria-label", "Փակել տեսանյութը");
  close.textContent = "×";
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "video-dock-open";
  expand.setAttribute("aria-label", "Բացել տեսանյութի էջը");
  expand.innerHTML = ICON_OPEN;
  const controls = dockControls(video);
  // Անկյունների նշանները՝ որտեղից կարելի է քաշել և փոխել չափը։
  const corners = ["tl", "tr", "bl", "br"].map((corner) => {
    const mark = document.createElement("span");
    mark.className = "video-dock-corner";
    mark.dataset.corner = corner;
    mark.setAttribute("aria-hidden", "true");
    return mark;
  });
  for (const node of [surface, ...corners, close, expand, controls.bar]) box.appendChild(node);
  document.body.appendChild(box);
  moveInto(box, video);
  video.removeAttribute("style");
  video.className = "video-dock-video";
  video.setAttribute("aria-label", label);
  // Անկյունում բրաուզերի կոճակները չեն, որ սեղմելը և քաշելը աշխատեն։
  video.controls = false;
  const saved = readLayout();
  if (saved) applyLayout(box, saved);

  const open = () => {
    window.dispatchEvent(new CustomEvent("library:navigate", { detail: href }));
  };
  // Կոճակները երևում են սեղմելիս կամ քաշելիս և 3 վրկ հետո թաքնվում են։
  let hideTimer = 0;
  const ui = {
    visible: () => box.hasAttribute("data-ui"),
    show: () => {
      box.setAttribute("data-ui", "");
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => box.removeAttribute("data-ui"), 3000);
    },
  };
  ui.show();
  for (const node of [close, expand, ...Array.from(controls.bar.querySelectorAll("button"))]) {
    node.addEventListener("pointerdown", (event) => { event.stopPropagation(); ui.show(); });
  }
  expand.addEventListener("click", open);
  const stopInteract = makeInteractive(box, surface, ui, open);
  surface.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });

  // Բրաուզերի փոքր պատուհանում լինելիս անկյան պատուհանը թաքնված է (միայն մեկ պատուհան)։
  const syncPip = () => {
    if (isInPip(video)) { box.dataset.pip = ""; return; }
    delete box.dataset.pip;
    if (video.paused || video.ended) closeDock();
  };
  syncPip();
  const onEnded = () => { if (!isInPip(video)) closeDock(); };
  // Մեկ այլ ձայնագրություն կամ տեսանյութ միացնելիս dock-ինը կանգնում է։
  const onOtherPlay = (event: Event) => { if (event.target !== video && event.target instanceof HTMLMediaElement) video.pause(); };
  close.addEventListener("click", closeDock);
  video.addEventListener("ended", onEnded);
  video.addEventListener("enterpictureinpicture", syncPip);
  video.addEventListener("leavepictureinpicture", syncPip);
  video.addEventListener("webkitpresentationmodechanged", syncPip);
  document.addEventListener("play", onOtherPlay, true);
  docked = {
    video,
    box,
    href,
    cleanup: () => {
      stopInteract();
      window.clearTimeout(hideTimer);
      controls.cleanup();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("enterpictureinpicture", syncPip);
      video.removeEventListener("leavepictureinpicture", syncPip);
      video.removeEventListener("webkitpresentationmodechanged", syncPip);
      document.removeEventListener("play", onOtherPlay, true);
    },
  };
  return true;
}

/**
 * Տեսանյութի էջ բացելիս. նույն տեսանյութն է՝ փակում է dock-ը և ասում, որտեղից շարունակել,
 * ուրիշն է՝ dock-ը պարզապես փակվում է (միաժամանակ երկու քարոզ չի լինում)։
 */
export function takeDockedVideo(urls: string[]) {
  if (!docked) return null;
  const { video } = docked;
  const source = video.currentSrc || video.src;
  const same = urls.some((url) => url && (source === url || source === new URL(url, location.href).href));
  if (!same) { closeDock(); return null; }
  const position = { time: video.currentTime, play: !video.paused };
  closeDock();
  return position;
}

let autoPipReady = false;

/**
 * Chrome-ը (համակարգչում և Android-ում) կարող է ինքը բացել փոքր պատուհանը, երբ մարդը
 * անցնում է մեկ այլ ներդիր կամ ծրագիր, եթե կայքը գրանցել է այս գործողությունը։
 */
export function enableAutoPip() {
  if (autoPipReady || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  autoPipReady = true;
  try {
    navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => {
      const playing = Array.from(document.querySelectorAll("video")).find((video) => !video.paused && !video.muted);
      if (playing && document.pictureInPictureElement !== playing) void playing.requestPictureInPicture?.().catch(() => {});
    });
  } catch { /* բրաուզերը այս գործողությունը չգիտի */ }
}
