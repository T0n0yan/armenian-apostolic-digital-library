import { useCallback, useEffect, useState } from "react";

/**
 * «Եղել եմ»: which sacred places this reader has visited. Kept in the browser for everyone and, when
 * the reader is signed in, in their account too (marks made before signing in are carried over).
 */
const KEY = "library-visited-places";
// Known after the first answer from /api/place-visits; guests' marks stay in the browser only.
let signedIn = false;
const CHANGE = "library:place-visits";
// Whose marks the browser holds: "guest", or the account they came from. Another account's are never carried over.
const OWNER_KEY = "library-visited-places-owner";

function readOwner() {
  try { return localStorage.getItem(OWNER_KEY) ?? "guest"; } catch { return "guest"; }
}
function writeOwner(owner: string) {
  try { localStorage.setItem(OWNER_KEY, owner); } catch { /* Private mode. */ }
}

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
    // Signed in: a guest's marks go up to the account and join its own. Marks left by another account
    // on this phone are dropped, never given to this one; signed out, an account's marks leave the phone.
    void fetch("/api/place-visits").then((response) => response.json() as Promise<{ signedIn: boolean; account?: string; places: string[] }>).then((answer) => {
      signedIn = answer.signedIn;
      const owner = readOwner();
      if (!signedIn || !answer.account) {
        if (owner !== "guest") { writeOwner("guest"); writeLocal([]); }
        return;
      }
      const places = answer.places;
      const local = owner === "guest" || owner === answer.account ? readLocal() : [];
      const missing = local.filter((id) => !places.includes(id));
      if (missing.length) void send(missing, true);
      writeOwner(answer.account);
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
