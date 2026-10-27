/**
 * The reader's position for «Իմ մոտակայքում», asked only when they press the button. It stays on
 * the phone: the nearby places are worked out here, nothing is sent to the site.
 * In Telegram's Mini App the position comes from Telegram's own location access (Bot API 8.0),
 * elsewhere from the browser.
 */
type MyPosition = { latitude: number; longitude: number };
export type LocationFailure = "denied" | "unavailable" | "unsupported";

type TelegramLocationManager = {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init: (callback?: () => void) => void;
  getLocation: (callback: (data: { latitude: number; longitude: number } | null) => void) => void;
  openSettings: () => void;
};
type TelegramWindow = Window & { Telegram?: { WebApp?: { initData?: string; isVersionAtLeast?: (version: string) => boolean; LocationManager?: TelegramLocationManager } } };

function telegramLocation() {
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  if (!webApp?.initData || !webApp.isVersionAtLeast?.("8.0")) return null;
  return webApp.LocationManager ?? null;
}

function fromTelegram(manager: TelegramLocationManager) {
  return new Promise<MyPosition>((resolve, reject) => {
    const ask = () => {
      if (!manager.isLocationAvailable) { reject("unavailable" satisfies LocationFailure); return; }
      if (manager.isAccessRequested && !manager.isAccessGranted) { reject("denied" satisfies LocationFailure); return; }
      manager.getLocation((data) => data ? resolve({ latitude: data.latitude, longitude: data.longitude }) : reject("denied" satisfies LocationFailure));
    };
    if (manager.isInited) ask(); else manager.init(ask);
  });
}

function fromBrowser() {
  return new Promise<MyPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject("unsupported" satisfies LocationFailure); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject((error.code === error.PERMISSION_DENIED ? "denied" : "unavailable") satisfies LocationFailure),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

export async function findMyPosition(): Promise<MyPosition> {
  const manager = telegramLocation();
  if (manager) {
    try { return await fromTelegram(manager); } catch (failure) { if (failure === "denied") throw failure; }
  }
  return fromBrowser();
}

/** Telegram's settings page for the Mini App's location access (null outside Telegram). */
export function openLocationSettings() {
  const manager = telegramLocation();
  if (!manager) return false;
  manager.openSettings();
  return true;
}
