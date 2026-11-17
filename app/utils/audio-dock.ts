/**
 * Ձայնագրությունը (սաղմոս, աղոթք, քարոզ) չի կանգնում, երբ մարդը գնում է կայքի մեկ այլ էջ։
 *
 * - Նվագող `<audio>`-ը (նույն էլեմենտը, առանց կանգնելու) տեղափոխվում է էջից դուրս՝ `.audio-dock-host`,
 *   իսկ էկրանի ներքևում երևում է կառավարման գոտին (`components/audio-dock-bar.tsx`)։
 * - Նույն նյութի էջը նորից բացելիս գոտին փակվում է, և էջի նվագարկիչը շարունակում է նույն տեղից։
 * - Մեկ այլ ձայնագրություն կամ տեսանյութ միացնելիս գոտին փակվում է (միաժամանակ մեկ ձայն)։
 * - Ցանկերում այս նյութի քարտը նշվում է «Լսում եք» (`data-audio-playing`), գլխավոր էջում՝ նրա բաժինը։
 */

type MovableParent = HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };

export type DockedAudio = { audio: HTMLAudioElement; title: string; href: string };

let docked: (DockedAudio & { cleanup: () => void }) | null = null;
let snapshot: DockedAudio | null = null;
const listeners = new Set<() => void>();

function emit() {
  snapshot = docked ? { audio: docked.audio, title: docked.title, href: docked.href } : null;
  listeners.forEach((listener) => listener());
}

export function subscribeAudioDock(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAudioDock() {
  return snapshot;
}

function host() {
  let box = document.querySelector<HTMLElement>(".audio-dock-host");
  if (!box) {
    box = document.createElement("div");
    box.className = "audio-dock-host";
    box.hidden = true;
    document.body.appendChild(box);
  }
  return box as MovableParent;
}

/** Էլեմենտը մնում է նույնը. տեղափոխելիս ձայնը չի ընդհատվում (`moveBefore`, որտեղ կա)։ */
function moveInto(parent: MovableParent, audio: HTMLAudioElement) {
  if (typeof parent.moveBefore === "function") {
    try { parent.moveBefore(audio, null); return; } catch { /* հին բրաուզեր՝ սովորական տեղափոխում */ }
  }
  parent.appendChild(audio);
}

export function closeAudioDock() {
  if (!docked) return;
  const { audio, cleanup } = docked;
  docked = null;
  cleanup();
  audio.pause();
  audio.remove();
  emit();
  markPlayingCards();
}

/**
 * Կանչվում է նյութի էջից հեռանալիս։ Եթե ձայնագրությունը նվագում է, այն շարունակում է,
 * իսկ ներքևում երևում է կառավարման գոտին։ Վերադարձնում է՝ տեղափոխվե՞ց թե ոչ։
 */
export function dockAudio(audio: HTMLAudioElement, title: string, href: string) {
  if (typeof document === "undefined" || !audio.isConnected || audio.paused) return false;
  closeAudioDock();
  moveInto(host(), audio);
  audio.classList.add("audio-dock-audio");
  // Մեկ այլ ձայնագրություն կամ տեսանյութ միացնելիս սա փակվում է։
  const onOtherPlay = (event: Event) => {
    if (event.target !== audio && event.target instanceof HTMLMediaElement) closeAudioDock();
  };
  const onEnded = () => closeAudioDock();
  audio.addEventListener("ended", onEnded);
  document.addEventListener("play", onOtherPlay, true);
  docked = {
    audio,
    title,
    href,
    cleanup: () => {
      audio.removeEventListener("ended", onEnded);
      document.removeEventListener("play", onOtherPlay, true);
    },
  };
  emit();
  // Նոր էջի ցանկը կարող է ուշ բեռնվել. նշանը դրվում է մի քանի անգամ։
  [150, 700, 1600].forEach((delay) => window.setTimeout(markPlayingCards, delay));
  return true;
}

/** Նույն ձայնագրության էջը նորից բացելիս՝ փակում է գոտին և ասում, որտեղից շարունակել։ */
export function takeDockedAudio(urls: string[]) {
  if (!docked) return null;
  const { audio } = docked;
  const source = audio.currentSrc || audio.src;
  const same = urls.some((url) => url && (source === url || source === new URL(url, location.href).href));
  if (!same) return null;
  const position = { time: audio.currentTime, play: !audio.paused };
  closeAudioDock();
  return position;
}

/** Ցանկում «Լսում եք» նշանը՝ այս նյութի քարտին, իսկ գլխավոր էջում՝ նրա բաժնի քարտին։ */
export function markPlayingCards() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-audio-playing]").forEach((node) => node.removeAttribute("data-audio-playing"));
  if (!docked) return;
  const href = docked.href;
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"))) {
    const target = (anchor.getAttribute("href") ?? "").split(/[?#]/)[0];
    if (!target || target === "/") continue;
    if (target === href || href.startsWith(`${target}/`)) (anchor.closest("li") ?? anchor).setAttribute("data-audio-playing", "");
  }
}
