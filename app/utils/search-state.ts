/**
 * What the root data tells the phone's search (kept tiny: the root loads it on every page, the
 * search code itself only where searching happens).
 */
type RootCategory = { id: string; name: string; slug: string };

let currentVersion: string | null = null;
let rootState: { signedIn: boolean; categories: RootCategory[] } = { signedIn: false, categories: [] };

/** The library's content version: phones keep pages and the title index until it changes. */
export function setContentVersion(version: string | null | undefined) {
  if (version) currentVersion = version;
}

export function contentVersionNow() {
  return currentVersion;
}

/** What the search page needs from the root data when it answers without the server. */
export function setRootSearchState(state: { signedIn: boolean; categories: RootCategory[] }) {
  rootState = state;
}

export function rootSearchState() {
  return rootState;
}
