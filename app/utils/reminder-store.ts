import { useSyncExternalStore } from "react";

export type ActiveReminder = { materialId: string; at: string; repeat: string; title: string; categoryName: string | null };

/** Tells the in-app alarm and the header bell to reload the reader's reminders. */
export const REMINDERS_CHANGED_EVENT = "library:reminders-changed";

let reminders: ActiveReminder[] = [];
let loading: Promise<ActiveReminder[]> | null = null;
const listeners = new Set<() => void>();

function emit(next: ActiveReminder[]) {
  reminders = next;
  for (const listener of listeners) listener();
}

/** Loads the reader's active reminders (guests get none); shared by the alarm and the bell. */
export function loadReminders() {
  loading ??= fetch("/api/reminders?upcoming=1")
    .then((response) => response.ok ? response.json() as Promise<{ reminders?: ActiveReminder[] }> : { reminders: [] })
    .then((data) => { emit(data.reminders ?? []); return reminders; })
    .catch(() => reminders)
    .finally(() => { loading = null; });
  return loading;
}

export function useActiveReminders() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => reminders,
    () => [],
  );
}
