import { useCallback, useEffect, useState } from "react";

/**
 * «Եղել եմ»: which sacred places this reader has visited. Kept in the browser for everyone and, when
 * the reader is signed in, in their account too (marks made before signing in are carried over).
 */
const KEY = "library-visited-places";
// Known after the first answer from /api/place-visits; guests' marks stay in the browser only.
let signedIn = false;
const CHANGE = "library:place-visits";

function readLocal(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: Iterable<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set(ids)])); } catch { /* Private mode: kept for this visit only. */ }
  window.dispatchEvent(new Event(CHANGE));
}

function send(places: string[], visited: boolean) {
  return fetch("/api/place-visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ places, visited }) }).catch(() => null);
}

export function usePlaceVisits() {
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const sync = () => setVisited(new Set(readLocal()));
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    // Signed in: the account's marks join the browser's, and the browser's go up to the account.
    void fetch("/api/place-visits").then((response) => response.json() as Promise<{ signedIn: boolean; places: string[] }>).then((answer) => {
      signedIn = answer.signedIn;
      if (!signedIn) return;
      const places = answer.places;
      const local = readLocal();
      const missing = local.filter((id) => !places.includes(id));
      if (missing.length) void send(missing, true);
      writeLocal([...local, ...places]);
    }).catch(() => undefined);
    return () => { window.removeEventListener(CHANGE, sync); window.removeEventListener("storage", sync); };
  }, []);
  const toggle = useCallback((id: string) => {
    const current = new Set(readLocal());
    const next = !current.has(id);
    if (next) current.add(id); else current.delete(id);
    writeLocal(current);
    if (signedIn) void send([id], next);
  }, []);
  return { visited, toggle };
}
