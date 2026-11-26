/**
 * Էջի անձնական մասը (պահածներ, նշումներ, հարցման ձայնը, ադմինի իրավունքները)։ Կայքի ներսում
 * նավարկելիս էջի տվյալները (<էջ>.data) բոլորի համար նույնն են, ուստի Cloudflare-ը և հեռախոսը դրանք
 * պահում են նաև մուտք գործածների (Mini App) համար, իսկ անձնականը բերվում է զուգահեռ՝ /api/personal-ից։
 * Անանուն ընթերցողը այս հարցումը չի անում։
 */
let context = { signedIn: false, admin: false };
let appHydrated = false;

/** Էջը արդեն բացված է (root-ի effect). մինչ այդ loader-ները ստանում են սերվերի HTML-ի տվյալները՝ անձնականով։ */
export function markAppHydrated() {
  appHydrated = true;
}

export function isAppHydrated() {
  return appHydrated;
}

/** root.tsx-ը ասում է՝ մուտք գործա՞ծ է, ադմի՞ն է (մինչև երեխա էջերի loader-ները)։ */
export function setPersonalContext(next: { signedIn: boolean; admin: boolean }) {
  context = next;
}

export function needsPersonal() {
  return context.signedIn || context.admin;
}

/** Անձնականը էջի հասցեով (/psalms/22, /psalms). սխալի դեպքում՝ null (էջը ցույց է տրվում առանց դրա)։ */
export async function fetchPersonal<T>(kind: "material" | "category", path: string): Promise<T | null> {
  if (!needsPersonal()) return null;
  // Մատը դիպչելիս արդեն սկսված հարցումը (prefetchPersonal)՝ եթե թարմ է, օգտագործվում է մեկ անգամ։
  const key = `${kind}|${path}`;
  const early = warming.get(key);
  warming.delete(key);
  if (early && Date.now() - early.at < WARM_MS) return early.promise as Promise<T | null>;
  return requestPersonal<T>(kind, path);
}

const WARM_MS = 8_000;
const warming = new Map<string, { at: number; promise: Promise<unknown> }>();

/** Սկսում է անձնականի հարցումը նախօրոք (հղմանը դիպչելիս), որ էջը բացվելիս պատրաստ լինի։ */
export function prefetchPersonal(kind: "material" | "category", path: string) {
  if (!needsPersonal()) return;
  const key = `${kind}|${path}`;
  const existing = warming.get(key);
  if (existing && Date.now() - existing.at < WARM_MS) return;
  warming.set(key, { at: Date.now(), promise: requestPersonal(kind, path) });
}

async function requestPersonal<T>(kind: "material" | "category", path: string): Promise<T | null> {
  try {
    const response = await fetch(`/api/personal?kind=${kind}&path=${encodeURIComponent(path)}`, { credentials: "same-origin", cache: "no-store" });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}
