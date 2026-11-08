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
  try {
    const response = await fetch(`/api/personal?kind=${kind}&path=${encodeURIComponent(path)}`, { credentials: "same-origin", cache: "no-store" });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}
