import { useSyncExternalStore } from "react";

export type ActiveReminder = { materialId: string; at: string; repeat: string; title: string; categoryName: string | null };
export type MissedReminder = { materialId: string; rangAt: string; title: string; categoryName: string | null };

/** Tells the in-app alarm and the header bell to reload the reader's reminders. */
export const REMINDERS_CHANGED_EVENT = "library:reminders-changed";
/** Fired when the in-app alarm rings, so the floating bell swings. */
export const REMINDER_RINGING_EVENT = "library:reminder-ringing";

let reminders: ActiveReminder[] = [];
let missed: MissedReminder[] = [];
let loading: Promise<ActiveReminder[]> | null = null;
const listeners = new Set<() => void>();

function emit(next: ActiveReminder[], nextMissed: MissedReminder[] = missed) {
  reminders = next;
  missed = nextMissed;
  for (const listener of listeners) listener();
}

/** Loads the reader's active reminders (guests get none); shared by the alarm and the bell. */
export function loadReminders() {
  loading ??= fetch("/api/reminders?upcoming=1")
    .then((response) => response.ok ? response.json() as Promise<{ reminders?: ActiveReminder[]; missed?: MissedReminder[] }> : { reminders: [], missed: [] })
    .then((data) => { emit(data.reminders ?? [], data.missed ?? []); return reminders; })
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

export function useMissedReminders() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => missed,
    () => [],
  );
}

/** "Կարդացել եմ": removes a rung reminder from the bell's list. */
export async function markReminderRead(materialId: string, { quiet = false } = {}) {
  const listed = missed.some((item) => item.materialId === materialId);
  if (quiet && !listed) return;
  emit(reminders, missed.filter((item) => item.materialId !== materialId));
  await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, read: true }) }).catch(() => null);
}

/** "Կարդացել եմ" in the bell's list: clears the reminder and marks the material read today. */
export async function markReminderDone(materialId: string) {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await Promise.all([
    markReminderRead(materialId),
    fetch("/api/reading-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, day, kind: "read" }) }).catch(() => null),
  ]);
}

/** Removes a rung reminder from the bell's list without marking anything read. */
export const dismissReminder = (materialId: string) => markReminderRead(materialId);

/** Cancels a reminder (and its repeats) right away, everywhere it is shown. */
export async function cancelReminder(materialId: string) {
  emit(reminders.filter((item) => item.materialId !== materialId), missed.filter((item) => item.materialId !== materialId));
  const post = (body: Record<string, unknown>) => fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, ...body }) }).catch(() => null);
  await Promise.all([post({ remove: true }), post({ read: true })]);
}
