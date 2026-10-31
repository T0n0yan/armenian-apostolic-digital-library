import { useCallback, useEffect, useState } from "react";
import { useRouteLoaderData } from "react-router";

/**
 * «Եղել եմ»: which sacred places this reader has visited. Only signed-in readers have it: their
 * marks live in their account, with a copy in the browser so the map shows them at once.
 */
const KEY = "library-visited-places";
const CHANGE = "library:place-visits";
// Whose marks the browser copy holds: another account's are never shown or carried over.
const OWNER_KEY = "library-visited-places-owner";

function readLocal(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: Iterable<string>, owner: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
    localStorage.setItem(OWNER_KEY, owner);
  } catch { /* Private mode: kept for this visit only. */ }
  window.dispatchEvent(new Event(CHANGE));
}

function send(places: string[], visited: boolean) {
  return fetch("/api/place-visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ places, visited }) }).catch(() => null);
}

/** Whether the reader is signed in (from the root loader): guests can't see or mark visits. */
export function useSignedIn() {
  return Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
}

export function usePlaceVisits() {
  const signedIn = useSignedIn();
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setVisited(new Set());
      setAccount(null);
      return;
    }
    let owner: string | null = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch { /* blocked */ }
    // The browser copy, until the account answers (only if it is this account's: checked below).
    const sync = () => setVisited(new Set(readLocal()));
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    void fetch("/api/place-visits").then((response) => response.json() as Promise<{ signedIn: boolean; account?: string; places: string[] }>).then((answer) => {
      if (!answer.signedIn || !answer.account) return;
      setAccount(answer.account);
      writeLocal(answer.places, answer.account);
    }).catch(() => {
      // Offline: the copy is shown only when it belongs to this browser's last account.
      if (owner) sync();
    });
    return () => { window.removeEventListener(CHANGE, sync); window.removeEventListener("storage", sync); };
  }, [signedIn]);
  const toggle = useCallback((id: string) => {
    if (!signedIn || !account) return;
    const current = new Set(readLocal());
    const next = !current.has(id);
    if (next) current.add(id); else current.delete(id);
    writeLocal(current, account);
    void send([id], next);
  }, [account, signedIn]);
  return { visited, toggle, signedIn };
}
