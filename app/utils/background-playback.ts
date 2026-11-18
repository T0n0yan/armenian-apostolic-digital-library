/**
 * Ձայնը չի կանգնում, երբ մարդը դուրս է գալիս բրաուզերից (այլ ծրագիր, էկրանի կողպում)։
 *
 * - Հեռախոսի բրաուզերները (Android Chrome, iPhone Safari) ֆոնում կանգնեցնում են `<video>`-ը, բայց ոչ
 *   `<audio>`-ը. ուստի էջը թաքնվելիս տեսանյութի ձայնը անմիջապես շարունակում է նախօրոք պատրաստված
 *   `<audio>`-ով (մի պահ միասին են նվագում, դադար չկա), իսկ վերադառնալիս տեսանյութը շարունակում է
 *   ձայնի տեղից։ iPhone-ում այդ `<audio>`-ը «բացվում» է մարդու սեղմումով (Safari-ի կանոն)։
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

// Հեռախոս (Android, iPhone/iPad). համակարգչում ֆոնում տեսանյութը չի կանգնում, այնտեղ ոչինչ չենք անում։
function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isMobile() {
  return /Android/i.test(navigator.userAgent) || isIOS();
}

/**
 * Ֆոնի ձայնը պատրաստվում է նախօրոք (նույն հասցեն, Chrome-ը օգտագործում է արդեն բեռնվածը),
 * որ անցնելիս դադար չլինի։ iPhone-ում այն պետք է «բացել» մարդու սեղմումով, այլապես
 * Safari-ն ֆոնում չի թողնի միացնել. `play()` + անմիջապես `pause()` նույն սեղմման մեջ՝ ձայն չի լսվում։
 */
const spares = new WeakMap<HTMLVideoElement, { audio: HTMLAudioElement; unlocked: boolean }>();

function spareFor(video: HTMLVideoElement) {
  const source = video.currentSrc || video.src;
  if (!source) return null;
  let spare = spares.get(video);
  if (spare && spare.audio.src !== new URL(source, location.href).href) spare = undefined;
  if (!spare) {
    // Էջից անջատված էլեմենտ. էջի «մեկ այլ ձայն միացավ» լսիչները այն չեն տեսնում։
    const audio = new Audio();
    // Մինչև տեսանյութը չնվագի՝ միայն տևողությունը (ավելորդ ինտերնետ չծախսել)։
    audio.preload = video.paused ? "metadata" : "auto";
    audio.src = source;
    spare = { audio, unlocked: false };
    spares.set(video, spare);
  }
  return spare;
}

function unlockSpares() {
  for (const video of document.querySelectorAll("video")) {
    const spare = spareFor(video);
    if (!spare || spare.unlocked) continue;
    spare.unlocked = true;
    const attempt = spare.audio.play();
    spare.audio.pause();
    void attempt?.catch(() => { spare.unlocked = false; });
  }
}

/**
 * Տեսանյութի ձայնը շարունակում է `<audio>`-ով։ Ձայնը սկսում է նախքան տեսանյութը կանգնի
 * (մի պահ միասին են), որ լռություն չլինի։
 */
function startHandoff(video: HTMLVideoElement) {
  if (handoff || isInPip(video)) return;
  const spare = spareFor(video);
  if (!spare) return;
  const { audio } = spare;
  audio.volume = video.volume;
  audio.muted = video.muted;
  audio.setAttribute("aria-label", title(video));
  handoff = { video, audio };
  const begin = () => {
    if (handoff?.audio !== audio) return;
    audio.currentTime = video.currentTime;
    audio.addEventListener("playing", () => {
      if (handoff?.audio !== audio) return;
      // Միասին նվագելու պահին տեղերը համընկնում են։
      if (!video.paused) { audio.currentTime = video.currentTime; video.pause(); }
      setSession(audio);
    }, { once: true });
    void audio.play().catch(() => {
      // Բրաուզերը թույլ չտվեց. տեսանյութը մնում է, ինչպես կար։
      if (handoff?.audio === audio) handoff = null;
    });
  };
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) begin();
  else audio.addEventListener("loadedmetadata", begin, { once: true });
}

/** Էջը նորից երևաց. տեսանյութը շարունակում է ձայնի տեղից, ձայնը կանգնում է, երբ պատկերը արդեն գնում է։ */
function finishHandoff() {
  if (!handoff) return;
  const { video, audio } = handoff;
  handoff = null;
  const playing = !audio.paused && !audio.ended;
  if (!video.isConnected) { audio.pause(); return; }
  if (audio.currentTime > 0) video.currentTime = audio.currentTime;
  if (!playing) { audio.pause(); setSession(video); return; }
  const stop = () => {
    if (handoff) return;
    video.currentTime = audio.currentTime;
    audio.pause();
  };
  video.addEventListener("playing", stop, { once: true });
  void video.play().then(() => setSession(video)).catch(() => {
    // Տեսանյութը չմիացավ. ձայնը շարունակում է, ինչպես կար։
    video.removeEventListener("playing", stop);
    handoff = { video, audio };
  });
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
    if (event.target instanceof HTMLVideoElement && isMobile()) {
      const spare = spareFor(event.target);
      if (spare) spare.audio.preload = "auto";
    }
  }, true);

  // iPhone. ֆոնի ձայնը «բացվում» է մարդու ցանկացած սեղմումով, քանի դեռ էջում տեսանյութ կա։
  if (isIOS()) {
    document.addEventListener("touchend", unlockSpares, { capture: true, passive: true });
    document.addEventListener("click", unlockSpares, true);
  }

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
    if (document.visibilityState !== "hidden") { finishHandoff(); return; }
    hiddenAt = Date.now();
    // Հեռախոսում ձայնը միանում է անմիջապես, նախքան բրաուզերը կանգնեցնի տեսանյութը։
    // Համակարգչում ֆոնում տեսանյութը չի կանգնում, այնտեղ ոչինչ չի փոխվում։
    const media = active;
    if (isMobile() && media instanceof HTMLVideoElement && !media.paused && !media.ended && media.isConnected) startHandoff(media);
  });
}
