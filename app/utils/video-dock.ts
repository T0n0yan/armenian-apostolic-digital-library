/**
 * Տեսանյութը փոքր պատուհանում (Picture-in-Picture) և էջից դուրս գալիս նվագելը շարունակելը։
 *
 * - PiP՝ ստանդարտ API (Chrome, Edge, Safari macOS) կամ Safari iPhone-ի `webkitSetPresentationMode`։
 * - Եթե տեսանյութը նվագում է, և մարդը գնում է կայքի մեկ այլ էջ, նույն `<video>`-ը (առանց կանգնելու)
 *   տեղափոխվում է էկրանի անկյան փոքր նվագարկիչ (dock), որը փակվում է ×-ով։
 * - Անկյան պատուհանը քաշվում է մատով, չափը փոխվում է անկյան նշանով, սեղմելիս բացվում է տեսանյութի էջը։
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

/**
 * Մատով քաշել՝ տեղաշարժում է, ձախ վերևի նշանով՝ մեծացնում/փոքրացնում, կարճ սեղմել՝ բացում է տեսանյութի էջը։
 */
function makeInteractive(box: HTMLElement, surface: HTMLElement, grip: HTMLElement, open: () => void) {
  let start: { x: number; y: number; layout: Layout; ratio: number; mode: "move" | "resize"; moved: boolean } | null = null;
  const current = (): Layout => {
    const rect = box.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width };
  };
  const down = (mode: "move" | "resize") => (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const layout = current();
    start = { x: event.clientX, y: event.clientY, layout, ratio: box.offsetHeight / Math.max(1, layout.width), mode, moved: false };
    box.dataset.active = "";
  };
  const move = (event: PointerEvent) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 8) return;
    start.moved = true;
    const { layout } = start;
    if (start.mode === "move") applyLayout(box, { ...layout, left: layout.left + dx, top: layout.top + dy });
    else {
      // Նշանը ձախ վերևում է. աջ ներքևի անկյունը մնում է տեղում։
      const width = Math.min(Math.max(layout.width - dx, MIN_WIDTH), window.innerWidth - EDGE * 2);
      const shrink = layout.width - width;
      applyLayout(box, { left: layout.left + shrink, top: layout.top + shrink * start.ratio, width });
    }
  };
  const up = () => {
    if (!start) return;
    const { moved, mode } = start;
    start = null;
    delete box.dataset.active;
    if (moved) saveLayout(current());
    else if (mode === "move") open();
  };
  for (const [node, mode] of [[surface, "move"], [grip, "resize"]] as const) {
    node.addEventListener("pointerdown", down(mode));
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }
  const onResize = () => { if (box.style.left) applyLayout(box, current()); };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_PLAY = svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>');
const ICON_PAUSE = svg('<path d="M8 5v14M16 5v14"/>');
const ICON_BACK = svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>');
const ICON_FORWARD = svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>');
// Չափը փոխելու նշան՝ երկկողմ սլաք (↖↘)։
const ICON_RESIZE = svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');

/** Անկյան պատուհանի կոճակներ՝ 10 վրկ հետ, նվագել/կանգնեցնել, 10 վրկ առաջ։ */
function dockControls(video: HTMLVideoElement) {
  const bar = document.createElement("div");
  bar.className = "video-dock-controls";
  const button = (label: string, icon: string, action: () => void) => {
    const node = document.createElement("button");
    node.type = "button";
    node.setAttribute("aria-label", label);
    node.innerHTML = icon;
    node.addEventListener("pointerdown", (event) => event.stopPropagation());
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
  const grip = document.createElement("span");
  grip.className = "video-dock-grip";
  grip.setAttribute("aria-hidden", "true");
  grip.innerHTML = ICON_RESIZE;
  const controls = dockControls(video);
  for (const node of [surface, close, controls.bar, grip]) box.appendChild(node);
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
  const stopInteract = makeInteractive(box, surface, grip, open);
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
  close.addEventListener("pointerdown", (event) => event.stopPropagation());
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
