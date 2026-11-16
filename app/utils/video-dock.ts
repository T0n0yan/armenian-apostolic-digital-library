/**
 * Տեսանյութը փոքր պատուհանում (Picture-in-Picture) և էջից դուրս գալիս նվագելը շարունակելը։
 *
 * - PiP՝ ստանդարտ API (Chrome, Edge, Safari macOS) կամ Safari iPhone-ի `webkitSetPresentationMode`։
 * - Եթե տեսանյութը նվագում է, և մարդը գնում է կայքի մեկ այլ էջ, նույն `<video>`-ը (առանց կանգնելու)
 *   տեղափոխվում է էկրանի անկյան փոքր նվագարկիչ (dock), որը փակվում է ×-ով։
 * - Նույն տեսանյութի էջը նորից բացելիս dock-ը փակվում է, և նվագարկիչը շարունակում է նույն տեղից։
 */

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

type MovableParent = HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };

export function pipSupported(video: HTMLVideoElement) {
  if (typeof document !== "undefined" && document.pictureInPictureEnabled && !video.disablePictureInPicture) return true;
  const webkit = video as WebkitVideo;
  return typeof webkit.webkitSupportsPresentationMode === "function" && webkit.webkitSupportsPresentationMode("picture-in-picture");
}

export function isInPip(video: HTMLVideoElement) {
  return document.pictureInPictureElement === video || (video as WebkitVideo).webkitPresentationMode === "picture-in-picture";
}

/** Բացում կամ փակում է փոքր պատուհանը։ Կանչել միայն սեղմումից (բրաուզերը այլապես չի թողնի)։ */
export async function togglePip(video: HTMLVideoElement) {
  const webkit = video as WebkitVideo;
  if (isInPip(video)) {
    if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
    else webkit.webkitSetPresentationMode?.("inline");
    return;
  }
  if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
    await video.requestPictureInPicture();
  } else {
    webkit.webkitSetPresentationMode?.("picture-in-picture");
  }
  if (video.paused) await video.play().catch(() => {});
}

let docked: { video: HTMLVideoElement; box: HTMLElement; cleanup: () => void } | null = null;

function closeDock() {
  if (!docked) return;
  const { video, box, cleanup } = docked;
  docked = null;
  cleanup();
  video.pause();
  if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
  box.remove();
}

/** Տեսանյութը մնում է նույնը. տեղափոխելիս նվագումը և PiP-ը չեն ընդհատվում (`moveBefore`, որտեղ կա)։ */
function moveInto(parent: MovableParent, video: HTMLVideoElement) {
  if (typeof parent.moveBefore === "function") {
    try { parent.moveBefore(video, null); return; } catch { /* հին բրաուզեր՝ սովորական տեղափոխում */ }
  }
  parent.appendChild(video);
}

/**
 * Կանչվում է նվագարկիչի էջից հեռանալիս։ Եթե տեսանյութը նվագում է կամ PiP-ում է,
 * այն տեղափոխվում է անկյան փոքր նվագարկիչ և շարունակում է։ Վերադարձնում է՝ տեղափոխվե՞ց թե ոչ։
 */
export function dockVideo(video: HTMLVideoElement, label: string) {
  if (typeof document === "undefined" || !video.isConnected) return false;
  if (video.paused && !isInPip(video)) return false;
  closeDock();

  const box = document.createElement("div") as MovableParent;
  box.className = "video-dock";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Նվագող տեսանյութ");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "video-dock-close";
  close.setAttribute("aria-label", "Փակել տեսանյութը");
  close.textContent = "×";
  box.appendChild(close);
  document.body.appendChild(box);
  moveInto(box, video);
  video.removeAttribute("style");
  video.className = "video-dock-video";
  video.setAttribute("aria-label", label);

  const onEnded = () => { if (!isInPip(video)) closeDock(); };
  // Մեկ այլ ձայնագրություն կամ տեսանյութ միացնելիս dock-ինը կանգնում է։
  const onOtherPlay = (event: Event) => { if (event.target !== video && event.target instanceof HTMLMediaElement) video.pause(); };
  close.addEventListener("click", closeDock);
  video.addEventListener("ended", onEnded);
  document.addEventListener("play", onOtherPlay, true);
  docked = {
    video,
    box,
    cleanup: () => {
      video.removeEventListener("ended", onEnded);
      document.removeEventListener("play", onOtherPlay, true);
    },
  };
  return true;
}

/** Նույն տեսանյութի էջը նորից բացելիս՝ փակում է dock-ը և ասում, որտեղից շարունակել։ */
export function takeDockedVideo(urls: string[]) {
  if (!docked) return null;
  const { video } = docked;
  const source = video.currentSrc || video.src;
  const same = urls.some((url) => url && (source === url || source === new URL(url, location.href).href));
  if (!same) return null;
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
