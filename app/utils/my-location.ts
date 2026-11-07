/**
 * The reader's position for «Իմ մոտակայքում», asked only when they press the button. It stays on
 * the phone: the nearby places are worked out here, nothing is sent to the site.
 * In Telegram's Mini App the position comes from Telegram's own location access (Bot API 8.0),
 * elsewhere from the browser.
 */
type MyPosition = { latitude: number; longitude: number };
export type LocationFailure = "denied" | "unavailable" | "unsupported";

/** Ինչ սարքում/բրաուզերում ենք. տեղորոշումը միացնելու քայլերը տարբեր են։ */
export type DeviceKind = "telegram" | "ios" | "android" | "desktop";
export function deviceKind(): DeviceKind {
  if (typeof window === "undefined") return "desktop";
  if ((window as TelegramWindow).Telegram?.WebApp?.initData) return "telegram";
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  return "desktop";
}

/** Բրաուզերի թույլտվության վիճակը՝ առանց հարցնելու (եթե բրաուզերը դա ասում է)։ */
export async function locationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return status?.state ?? "unknown";
  } catch { return "unknown"; }
}

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
      // Մեկ անգամ մերժելուց հետո Telegram-ը այլևս չի հարցնում. միանգամից բացում ենք իր կարգավորումների
      // էջը, որ մարդը մեկ սեղմումով միացնի (փնտրել պետք չլինի)։ Կանչվում է միայն մարդու սեղմումից։
      if (manager.isAccessRequested && !manager.isAccessGranted) {
        try { manager.openSettings(); } catch { /* հին Telegram */ }
        reject("denied" satisfies LocationFailure);
        return;
      }
      manager.getLocation((data) => data ? resolve({ latitude: data.latitude, longitude: data.longitude }) : reject("denied" satisfies LocationFailure));
    };
    if (manager.isInited) ask(); else manager.init(ask);
  });
}

function fromBrowser(precise: boolean) {
  return new Promise<MyPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject("unsupported" satisfies LocationFailure); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject((error.code === error.PERMISSION_DENIED ? "denied" : "unavailable") satisfies LocationFailure),
      // Ճշգրիտ՝ GPS և թարմ դիրք (եկեղեցու 200 մ շառավղի համար), սովորական՝ արագ և խնայող։
      precise ? { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 } : { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

export async function findMyPosition({ precise = false }: { precise?: boolean } = {}): Promise<MyPosition> {
  const manager = telegramLocation();
  if (manager) {
    try { return await fromTelegram(manager); } catch (failure) { if (failure === "denied") throw failure; }
  }
  return fromBrowser(precise);
}

/** Telegram's settings page for the Mini App's location access (null outside Telegram). */
export function openLocationSettings() {
  const manager = telegramLocation();
  if (!manager) return false;
  manager.openSettings();
  return true;
}

/**
 * Մարդը արդեն թույլ տվե՞լ է դիրքը (Telegram-ում կամ բրաուզերում)։ Ոչինչ չի հարցնում. օգտագործվում
 * է լուռ ստուգումների համար («Դուք ունեք հարց, մոտակայքում կա եկեղեցի»)։
 */
export async function hasLocationAccess(): Promise<boolean> {
  const manager = typeof window === "undefined" ? null : telegramLocation();
  if (manager) {
    return new Promise((resolve) => {
      const check = () => resolve(manager.isLocationAvailable && manager.isAccessGranted);
      if (manager.isInited) check(); else manager.init(check);
    });
  }
  return (await locationPermission()) === "granted";
}
