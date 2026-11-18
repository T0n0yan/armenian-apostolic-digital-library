/**
 * Ձայնը չի կանգնում, երբ մարդը դուրս է գալիս բրաուզերից (այլ ծրագիր, էկրանի կողպում)։
 *
 * - Android Chrome-ը ֆոնում կանգնեցնում է `<video>`-ը, բայց ոչ `<audio>`-ը. ուստի եթե թաքնվելու պահին
 *   բրաուզերը կանգնեցրեց տեսանյութը, նրա ձայնը նույն տեղից շարունակում է առանձին `<audio>`-ով, իսկ վերադառնալիս
 *   տեսանյութը շարունակում է այնտեղից, որտեղ հասել էր ձայնը։
 * - Եթե բրաուզերը ինքը կանգնեցրեց ձայնագրությունը թաքնվելու պահին, այն մեկ անգամ նորից միանում է։
 * - Media Session. հեռախոսի ծանուցումում և կողպված էկրանին՝ անուն, նկար, ▶/❚❚, 10 վրկ հետ/առաջ։
 * - Telegram-ի ներսում (Mini App) Telegram-ը ինքն է կանգնեցնում ամեն ինչ. այնտեղ սա չի օգնի։
 */

import { isInPip } from "./video-dock";

let installed = false;
let active: HTMLMediaElement | null = null;
let handoff: { video: HTMLVideoElement; audio: HTMLAudioElement } | null = null;
let hiddenAt = 0;
let userPaused = false;

const RESUME_WINDOW_MS = 2000;

function title(media: HTMLMediaElement) {
  return media.getAttribute("aria-label") || document.title || "Apostolic.am";
}

function setSession(media: HTMLMediaElement) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  const image = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title(media),
      artist: "Apostolic.am",
      artwork: image ? [{ src: image, sizes: "1200x630", type: "image/jpeg" }] : [],
    });
  } catch { /* հին բրաուզեր */ }
}

/** Հիմա լսվողը՝ ֆոնի ձայնը (եթե կա) կամ էջի նվագարկիչը։ */
function current() {
  return handoff?.audio ?? active;
}

function bindActions() {
  if (!("mediaSession" in navigator)) return;
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* բրաուզերը չգիտի */ }
  };
  const seek = (delta: number) => {
    const media = current();
    if (!media) return;
    const end = Number.isFinite(media.duration) ? media.duration - 0.5 : Infinity;
    media.currentTime = Math.max(0, Math.min(media.currentTime + delta, end));
  };
  set("play", () => { userPaused = false; void current()?.play().catch(() => {}); });
  set("pause", () => { userPaused = true; current()?.pause(); });
  set("seekbackward", (details) => seek(-(details.seekOffset ?? 10)));
  set("seekforward", (details) => seek(details.seekOffset ?? 10));
}

/** Բրաուզերը ֆոնում կանգնեցրեց տեսանյութը. նրա ձայնը շարունակում է `<audio>`-ով։ */
function startHandoff(video: HTMLVideoElement) {
  const source = video.currentSrc || video.src;
  if (!source || isInPip(video)) return;
  // Էջից անջատված էլեմենտ. էջի «մեկ այլ ձայն միացավ» լսիչները այն չեն տեսնում։
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = source;
  audio.volume = video.volume;
  audio.setAttribute("aria-label", title(video));
  const time = video.currentTime;
  const begin = () => {
    audio.currentTime = time;
    void audio.play().then(() => setSession(audio)).catch(() => {
      // Բրաուզերը թույլ չտվեց. թողնել տեսանյութը, ինչպես կար։
      if (handoff?.audio === audio) handoff = null;
    });
  };
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) begin();
  else audio.addEventListener("loadedmetadata", begin, { once: true });
  handoff = { video, audio };
  video.pause();
}

/** Էջը նորից երևաց. տեսանյութը շարունակում է այնտեղից, որտեղ հասել էր ձայնը։ */
function finishHandoff() {
  if (!handoff) return;
  const { video, audio } = handoff;
  handoff = null;
  const playing = !audio.paused && !audio.ended;
  const time = audio.currentTime;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if (time > 0) video.currentTime = time;
  if (playing && video.isConnected) void video.play().catch(() => {});
  if (video.isConnected) setSession(video);
}

export function installBackgroundPlayback() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  bindActions();

  document.addEventListener("play", (event) => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    active = event.target;
    userPaused = false;
    setSession(event.target);
  }, true);

  document.addEventListener("pause", (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement) || media !== active || handoff?.video === media) return;
    // Բրաուզերը կանգնեցրեց հենց թաքնվելու պահին (ոչ թե մարդը). մեկ անգամ նորից միացնել։
    const browserPause = document.visibilityState === "hidden" && !userPaused && !media.ended
      && Date.now() - hiddenAt < RESUME_WINDOW_MS;
    if (!browserPause) return;
    if (media instanceof HTMLVideoElement) startHandoff(media);
    else void media.play().catch(() => {});
  }, true);

  document.addEventListener("visibilitychange", () => {
    // Միայն երբ բրաուզերը ինքը կանգնեցնի (տես վերևի pause լսիչը). համակարգչում, որտեղ ֆոնում
    // տեսանյութը չի կանգնում, ոչինչ չի փոխվում։
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else finishHandoff();
  });
}
