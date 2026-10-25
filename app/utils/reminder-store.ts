import { useSyncExternalStore } from "react";

export const REMINDER_ERROR_EVENT = "library:reminder-error";
async function sendChange(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error("Reminder update failed");
    return response;
  } catch {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(REMINDER_ERROR_EVENT));
    return null;
  }
}

export type ActiveReminder = { materialId: string; at: string; repeat: string; title: string; categoryName: string | null };
export type MissedReminder = { materialId: string; rangAt: string; title: string; categoryName: string | null };

/** Tells the in-app alarm and the header bell to reload the reader's reminders. */
export const REMINDERS_CHANGED_EVENT = "library:reminders-changed";
/** Fired when the in-app alarm rings, so the floating bell swings. */
export const REMINDER_RINGING_EVENT = "library:reminder-ringing";

let reminders: ActiveReminder[] = [];
let missed: MissedReminder[] = [];
let loading: Promise<ActiveReminder[]> | null = null;
// Bumped on every local change, so a load that started before it can't bring back what the
// reader just marked read or cancelled.
let version = 0;
// "Rung" posts still on their way: marking read waits for them, or the server would put the
// reminder back in the bell's list after the read arrived.
const rungPosts = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

function emit(next: ActiveReminder[], nextMissed: MissedReminder[] = missed) {
  reminders = next;
  missed = nextMissed;
  for (const listener of listeners) listener();
}

let enabled = false;

/**
 * Only signed-in readers have reminders, so guests never ask the server for them. Set from the
 * root route on every render; signing in turns it on and reloads the reminders.
 */
export function setRemindersEnabled(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  if (typeof window === "undefined") return;
  if (next) window.setTimeout(() => window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT)), 0);
  else emit([], []);
}

/** Loads the reader's active reminders (guests get none); shared by the alarm and the bell. */
export function loadReminders({ fresh = false } = {}) {
  if (!enabled) return Promise.resolve(reminders);
  if (loading && !fresh) return loading;
  const started = version;
  const request: Promise<ActiveReminder[]> = fetch("/api/reminders?upcoming=1")
    .then((response) => response.ok ? response.json() as Promise<{ reminders?: ActiveReminder[]; missed?: MissedReminder[] }> : null)
    .then((data) => { if (data && started === version) emit(data.reminders ?? [], data.missed ?? []); return reminders; })
    .catch(() => reminders)
    .finally(() => { if (loading === request) loading = null; });
  loading = request;
  return request;
}

function changeLocally(next: ActiveReminder[], nextMissed: MissedReminder[]) {
  version += 1;
  emit(next, nextMissed);
}

/** Closes the phone's notification for this reminder once it is handled in the app. */
function closeSystemNotification(materialId: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistration()
    .then((registration) => registration?.getNotifications({ tag: `reminder-${materialId}` }))
    .then((notifications) => { for (const notification of notifications ?? []) notification.close(); })
    .catch(() => undefined);
}

/** Tells the server the in-app alarm rang, so the bot and the phone don't announce it again. */
export function markReminderRung(materialId: string) {
  const posted = sendChange("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, rang: true }) })
    .catch(() => null)
    .finally(() => { if (rungPosts.get(materialId) === posted) rungPosts.delete(materialId); });
  rungPosts.set(materialId, posted);
  return posted;
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
  if (quiet && !listed && !rungPosts.has(materialId)) return;
  await rungPosts.get(materialId);
  const response = await sendChange("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, read: true }) });
  if (!response) return;
  changeLocally(reminders, missed.filter((item) => item.materialId !== materialId));
  closeSystemNotification(materialId);
  void loadReminders({ fresh: true });
}

/** "Կարդացել եմ" in the bell's list: clears the reminder and marks the material read today. */
export async function markReminderDone(materialId: string) {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await Promise.all([
    markReminderRead(materialId),
    sendChange("/api/reading-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, day, kind: "read" }) }),
  ]);
}

/** Removes a rung reminder from the bell's list without marking anything read. */
export const dismissReminder = (materialId: string) => markReminderRead(materialId);

/** "1 / 5 րոպեից": rings again in a few minutes; until then it leaves the bell's list. */
export async function snoozeReminder(materialId: string, minutes: 1 | 5) {
  await rungPosts.get(materialId);
  const response = await sendChange("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, snooze: minutes }) });
  if (!response) return;
  changeLocally(reminders, missed.filter((item) => item.materialId !== materialId));
  closeSystemNotification(materialId);
  void loadReminders({ fresh: true });
}

/** Cancels a reminder (and its repeats) right away, everywhere it is shown. */
export async function cancelReminder(materialId: string) {
  await rungPosts.get(materialId);
  const post = (body: Record<string, unknown>) => sendChange("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, ...body }) });
  const results = await Promise.all([post({ remove: true }), post({ read: true })]);
  if (results.every(Boolean)) {
    changeLocally(reminders.filter((item) => item.materialId !== materialId), missed.filter((item) => item.materialId !== materialId));
    closeSystemNotification(materialId);
  }
  void loadReminders({ fresh: true });
}
