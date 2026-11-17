/**
 * Տեսանյութի վերջին դիրքը (որտեղ էր հասել մարդը)։ Պահվում է հեռախոսում (localStorage),
 * և էջը նորից բացելիս տեսանյութը սկսում է այդտեղից։ Վերջին 15 վրկ-ում՝ ջնջվում է (դիտված է)։
 */

const PREFIX = "video-position:";
const MIN_SECONDS = 5;
const END_MARGIN = 15;
const watched = new WeakSet<HTMLMediaElement>();

function storageKey(url: string) {
  // Հասցեի հարցման մասը (?v=, retry) նույն տեսանյութն է։
  return PREFIX + url.split("?")[0];
}

export function savedVideoPosition(url: string) {
  try {
    const value = Number(localStorage.getItem(storageKey(url)));
    return Number.isFinite(value) && value >= MIN_SECONDS ? value : 0;
  } catch {
    return 0;
  }
}

function store(url: string, video: HTMLMediaElement) {
  // Աղբյուրը փոխվելիս (retry) դիրքը 0 է. չջնջել պահվածը։
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;
  try {
    const { currentTime, duration } = video;
    const finished = video.ended || (Number.isFinite(duration) && currentTime >= duration - END_MARGIN);
    if (finished || currentTime < MIN_SECONDS) localStorage.removeItem(storageKey(url));
    else localStorage.setItem(storageKey(url), String(Math.floor(currentTime)));
  } catch { /* գաղտնի ռեժիմ կամ լի հիշողություն */ }
}

/**
 * Հետևում է դիրքին՝ նաև երբ տեսանյութը տեղափոխված է անկյան պատուհան (լսիչները էլեմենտի վրա են,
 * React-ից անկախ)։ Առաջին բեռնվելիս վերադառնում է պահված դիրքին։
 */
export function watchVideoPosition(video: HTMLMediaElement, url: string) {
  if (watched.has(video)) return;
  watched.add(video);
  let last = 0;
  const restore = () => {
    const position = savedVideoPosition(url);
    const duration = video.duration;
    if (position && video.currentTime < 1 && (!Number.isFinite(duration) || position < duration - END_MARGIN)) {
      video.currentTime = position;
    }
  };
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) restore();
  else video.addEventListener("loadedmetadata", restore, { once: true });
  video.addEventListener("timeupdate", () => {
    const now = Date.now();
    if (now - last < 3000) return;
    last = now;
    store(url, video);
  });
  video.addEventListener("pause", () => store(url, video));
  video.addEventListener("ended", () => store(url, video));
  window.addEventListener("pagehide", () => { if (video.isConnected) store(url, video); });
}
