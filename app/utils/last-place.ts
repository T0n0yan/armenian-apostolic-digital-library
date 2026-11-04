/**
 * «Որտեղ էիք կանգնել». ամեն բաժնի համար վերջին կարդացած կամ լսած նյութը (այս սարքում, localStorage)։
 * Ընդհանուր է բոլոր բաժինների համար (հետագայում՝ նաև Աստվածաշունչ). բաժինը հասցեի առաջին մասն է
 * («/psalms/25» → «psalms»)։ «Օրվա ընթերցումները» (փոխվում են ամեն օր) և սրբավայրերը չեն հիշվում։
 */
export type LastPlace = {
  section: string;
  sectionName: string;
  path: string;
  title: string;
  kind: "read" | "listen";
  /** Երբ (ms)։ */
  at: number;
  /** Որքան էր թերթել էջը (0–1)։ */
  progress: number;
};

const KEY = "last-places";
const KEEP_DAYS = 60;
export const NOT_REMEMBERED = new Set(["daily", "places"]);

export function sectionOfPath(path: string) {
  return path.split("/").filter(Boolean)[0] ?? "";
}

function readAll(): Record<string, LastPlace> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, LastPlace>;
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

export function rememberPlace(place: Omit<LastPlace, "at"> & { at?: number }) {
  if (!place.section || NOT_REMEMBERED.has(place.section)) return;
  const all = readAll();
  all[place.section] = { ...place, at: place.at ?? Date.now(), progress: Math.min(1, Math.max(0, place.progress)) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* պահեստը փակ է */ }
}

/** Մեկ բաժնի վերջինը, կամ (առանց բաժնի)՝ բոլոր բաժիններից ամենավերջինը։ Հները (60 օր) չեն ցույց տրվում։ */
export function lastPlace(section?: string): LastPlace | null {
  const fresh = Object.values(readAll()).filter((place) => place?.path && Date.now() - place.at < KEEP_DAYS * 86_400_000 && !NOT_REMEMBERED.has(place.section));
  const list = section ? fresh.filter((place) => place.section === section) : fresh;
  return list.sort((a, b) => b.at - a.at)[0] ?? null;
}

export function forgetPlace(section: string) {
  const all = readAll();
  delete all[section];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* պահեստը փակ է */ }
}

/** «հենց հիմա», «5 րոպե առաջ», «2 ժամ առաջ», «երեկ», «3 օր առաջ»։ */
export function timeAgo(at: number, now = Date.now()) {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 2) return "հենց հիմա";
  if (minutes < 60) return `${minutes} րոպե առաջ`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ժամ առաջ`;
  const days = Math.round(hours / 24);
  return days === 1 ? "երեկ" : `${days} օր առաջ`;
}
